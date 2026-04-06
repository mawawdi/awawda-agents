import { describe, expect, it, vi } from 'vitest';

import { CustomerActivationTokenExpiredError, CustomerActivationTokenInvalidError } from './sessions.errors';
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
      { customerSessionTtlSeconds: 7200 },
      erpGateway,
    );

    const response = await service.activateSession('plain-token');

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
  });

  it('rejects invalid activation token', async () => {
    const service = new SessionsService(
      {
        activateMagicToken: vi.fn().mockResolvedValue({ kind: 'invalid' }),
        validateCustomerSession: vi.fn(),
        listApprovedItems: vi.fn(),
      },
      { sign: vi.fn() },
      { customerSessionTtlSeconds: 7200 },
      {
        handoffOrder: vi.fn(),
        getHealth: vi.fn(),
        getMasterCatalog: vi.fn(),
        getCustomerRecentItems: vi.fn(),
        getCustomerPricing: vi.fn(),
      },
    );

    await expect(service.activateSession('invalid-token')).rejects.toBeInstanceOf(
      CustomerActivationTokenInvalidError,
    );
  });

  it('rejects expired activation token', async () => {
    const service = new SessionsService(
      {
        activateMagicToken: vi.fn().mockResolvedValue({ kind: 'expired' }),
        validateCustomerSession: vi.fn(),
        listApprovedItems: vi.fn(),
      },
      { sign: vi.fn() },
      { customerSessionTtlSeconds: 7200 },
      {
        handoffOrder: vi.fn(),
        getHealth: vi.fn(),
        getMasterCatalog: vi.fn(),
        getCustomerRecentItems: vi.fn(),
        getCustomerPricing: vi.fn(),
      },
    );

    await expect(service.activateSession('expired-token')).rejects.toBeInstanceOf(
      CustomerActivationTokenExpiredError,
    );
  });
});
