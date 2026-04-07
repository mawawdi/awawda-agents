import { describe, expect, it, vi } from 'vitest';

import type { ActivationRateLimitResult } from './activation-rate-limiter';
import { CustomerActivationRateLimitedError, CustomerActivationTokenExpiredError, CustomerActivationTokenInvalidError } from './sessions.errors';
import { SessionsService } from './sessions.service';
import type { CustomerSessionTokenSigner, CustomerSessionsRepository } from './sessions.types';
import type { ErpGateway } from '../erp/erp.gateway';

describe('SessionsService', () => {
  it('activates valid tokens and returns portal payload + session token', async () => {
    const repository: CustomerSessionsRepository = {
      activateMagicToken: vi.fn().mockResolvedValue({
        kind: 'activated',
        sessionId: 'sess-1',
        customerId: 'cust-1',
        sessionExpiresAt: new Date('2026-04-07T12:00:00.000Z'),
      }),
      validateCustomerSession: vi.fn(),
      deactivateCustomerSession: vi.fn(),
      recordActivationAttempt: vi.fn().mockResolvedValue(undefined),
      listApprovedItems: vi.fn().mockResolvedValue([
        {
          hashItemId: 'item-1',
          addedByAgentId: 'agent-1',
          createdAt: '2026-04-07T10:00:00.000Z',
        },
      ]),
    };
    const signer: CustomerSessionTokenSigner = {
      sign: vi.fn().mockReturnValue('signed-session-token'),
    };
    const erpGateway: ErpGateway = {
      handoffOrder: vi.fn(),
      getHealth: vi.fn(),
      getAssignedCustomers: vi.fn(),
      getMasterCatalog: vi.fn(),
      getCustomerRecentItems: vi.fn().mockResolvedValue({
        source: 'hashavshevet',
        syncedAt: '2026-04-07T11:00:00.000Z',
        items: [
          {
            itemId: 'item-1',
            name: 'Ribeye Steak',
            lastOrderedAt: '2026-04-07T09:00:00.000Z',
          },
        ],
      }),
      getCustomerPricing: vi.fn().mockResolvedValue({
        source: 'hashavshevet',
        syncedAt: '2026-04-07T11:00:00.000Z',
        version: 'v-17',
        lines: [
          {
            itemId: 'item-1',
            unitPrice: 42.5,
            currency: 'ILS',
          },
        ],
      }),
    };

    const service = new SessionsService(
      repository,
      signer,
      { customerSessionTtlSeconds: 7200, activationRateLimitBurst: 5, activationRateLimitWindowSeconds: 60 },
      erpGateway,
      createLimiter(() => ({ allowed: true })),
    );

    const response = await service.activateSession('plain-token', '198.51.100.10');

    expect(response).toMatchObject({
      sessionToken: 'signed-session-token',
      customer: {
        customerId: 'cust-1',
      },
      recentItems: [
        {
          itemId: 'item-1',
        },
      ],
      approvedItems: [
        {
          hashItemId: 'item-1',
        },
      ],
      pricing: [
        {
          itemId: 'item-1',
          unitPrice: 42.5,
        },
      ],
      priceListVersion: 'v-17',
      sessionExpiresAt: '2026-04-07T12:00:00.000Z',
    });
    expect(vi.mocked(signer.sign)).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'sess-1',
        customerId: 'cust-1',
        type: 'customer_session',
      }),
      7200,
    );
    expect(repository.recordActivationAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'success',
        clientIp: '198.51.100.10',
        customerId: 'cust-1',
      }),
    );
  });

  it('rejects invalid activation token', async () => {
    const service = new SessionsService(
      {
        activateMagicToken: vi.fn().mockResolvedValue({ kind: 'invalid' }),
        validateCustomerSession: vi.fn(),
        deactivateCustomerSession: vi.fn(),
        recordActivationAttempt: vi.fn().mockResolvedValue(undefined),
        listApprovedItems: vi.fn(),
      },
      { sign: vi.fn() },
      { customerSessionTtlSeconds: 7200, activationRateLimitBurst: 5, activationRateLimitWindowSeconds: 60 },
      {
        handoffOrder: vi.fn(),
        getHealth: vi.fn(),
        getAssignedCustomers: vi.fn(),
        getMasterCatalog: vi.fn(),
        getCustomerRecentItems: vi.fn(),
        getCustomerPricing: vi.fn(),
      },
      createLimiter(() => ({ allowed: true })),
    );

    await expect(service.activateSession('invalid-token', '198.51.100.11')).rejects.toBeInstanceOf(
      CustomerActivationTokenInvalidError,
    );
  });

  it('rejects expired activation token', async () => {
    const service = new SessionsService(
      {
        activateMagicToken: vi.fn().mockResolvedValue({ kind: 'expired' }),
        validateCustomerSession: vi.fn(),
        deactivateCustomerSession: vi.fn(),
        recordActivationAttempt: vi.fn().mockResolvedValue(undefined),
        listApprovedItems: vi.fn(),
      },
      { sign: vi.fn() },
      { customerSessionTtlSeconds: 7200, activationRateLimitBurst: 5, activationRateLimitWindowSeconds: 60 },
      {
        handoffOrder: vi.fn(),
        getHealth: vi.fn(),
        getAssignedCustomers: vi.fn(),
        getMasterCatalog: vi.fn(),
        getCustomerRecentItems: vi.fn(),
        getCustomerPricing: vi.fn(),
      },
      createLimiter(() => ({ allowed: true })),
    );

    await expect(service.activateSession('expired-token', '198.51.100.12')).rejects.toBeInstanceOf(
      CustomerActivationTokenExpiredError,
    );
  });

  it('throttles abusive activation attempts with explicit 429 error', async () => {
    const repository: CustomerSessionsRepository = {
      activateMagicToken: vi.fn(),
      validateCustomerSession: vi.fn(),
      deactivateCustomerSession: vi.fn(),
      recordActivationAttempt: vi.fn().mockResolvedValue(undefined),
      listApprovedItems: vi.fn(),
    };

    const service = new SessionsService(
      repository,
      { sign: vi.fn() },
      { customerSessionTtlSeconds: 7200, activationRateLimitBurst: 5, activationRateLimitWindowSeconds: 60 },
      {
        handoffOrder: vi.fn(),
        getHealth: vi.fn(),
        getAssignedCustomers: vi.fn(),
        getMasterCatalog: vi.fn(),
        getCustomerRecentItems: vi.fn(),
        getCustomerPricing: vi.fn(),
      },
      createLimiter(() => ({ allowed: false, retryAfterSeconds: 30 })),
    );

    await expect(service.activateSession('plain-token', '203.0.113.55')).rejects.toBeInstanceOf(
      CustomerActivationRateLimitedError,
    );
    expect(repository.recordActivationAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'throttled',
        retryAfterSeconds: 30,
        clientIp: '203.0.113.55',
      }),
    );
  });

  it('closes customer session on logout', async () => {
    const repository: CustomerSessionsRepository = {
      activateMagicToken: vi.fn(),
      validateCustomerSession: vi.fn(),
      deactivateCustomerSession: vi.fn().mockResolvedValue(undefined),
      recordActivationAttempt: vi.fn().mockResolvedValue(undefined),
      listApprovedItems: vi.fn(),
    };

    const service = new SessionsService(
      repository,
      { sign: vi.fn() },
      { customerSessionTtlSeconds: 7200, activationRateLimitBurst: 5, activationRateLimitWindowSeconds: 60 },
      {
        handoffOrder: vi.fn(),
        getHealth: vi.fn(),
        getAssignedCustomers: vi.fn(),
        getMasterCatalog: vi.fn(),
        getCustomerRecentItems: vi.fn(),
        getCustomerPricing: vi.fn(),
      },
      createLimiter(() => ({ allowed: true })),
    );

    await service.logoutSession('sess-99', 'cust-99');

    expect(repository.deactivateCustomerSession).toHaveBeenCalledWith(
      'sess-99',
      'cust-99',
      expect.any(Date),
    );
  });
});

function createLimiter(factory: () => ActivationRateLimitResult): { consume: () => ActivationRateLimitResult } {
  return {
    consume: factory,
  };
}
