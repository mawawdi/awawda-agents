import jwt from 'jsonwebtoken';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ERP_GATEWAY, type ErpGateway } from './erp/erp.gateway';
import { createApiApp } from './server';
import { CUSTOMER_SESSIONS_REPOSITORY } from './sessions/sessions.constants';
import type { CustomerSessionsRepository } from './sessions/sessions.types';

describe('Customer session endpoints', () => {
  let app: NestFastifyApplication;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalJwtIssuer = process.env.JWT_ISSUER;
  const originalSessionTtl = process.env.CUSTOMER_SESSION_TOKEN_TTL;
  const originalActivationRateLimitBurst = process.env.CUSTOMER_SESSION_ACTIVATION_RATE_LIMIT_BURST;
  const originalActivationRateLimitWindowSeconds = process.env.CUSTOMER_SESSION_ACTIVATION_RATE_LIMIT_WINDOW_SECONDS;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'integration-test-secret';
    process.env.JWT_ISSUER = 'integration-suite';
    process.env.CUSTOMER_SESSION_TOKEN_TTL = '2h';
    process.env.CUSTOMER_SESSION_ACTIVATION_RATE_LIMIT_BURST = '2';
    process.env.CUSTOMER_SESSION_ACTIVATION_RATE_LIMIT_WINDOW_SECONDS = '1';

    app = await createApiApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const repository = app.get<CustomerSessionsRepository>(CUSTOMER_SESSIONS_REPOSITORY);
    vi.spyOn(repository, 'recordActivationAttempt').mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app.close();
    restoreEnv('JWT_SECRET', originalJwtSecret);
    restoreEnv('JWT_ISSUER', originalJwtIssuer);
    restoreEnv('CUSTOMER_SESSION_TOKEN_TTL', originalSessionTtl);
    restoreEnv('CUSTOMER_SESSION_ACTIVATION_RATE_LIMIT_BURST', originalActivationRateLimitBurst);
    restoreEnv('CUSTOMER_SESSION_ACTIVATION_RATE_LIMIT_WINDOW_SECONDS', originalActivationRateLimitWindowSeconds);
  });

  it('activates valid token and returns portal payload contract', async () => {
    const repository = app.get<CustomerSessionsRepository>(CUSTOMER_SESSIONS_REPOSITORY);
    const erpGateway = app.get<ErpGateway>(ERP_GATEWAY);

    vi.spyOn(repository, 'activateMagicToken').mockResolvedValue({
      kind: 'activated',
      sessionId: 'sess-10',
      customerId: 'cust-10',
      sessionExpiresAt: new Date('2026-04-08T14:00:00.000Z'),
    });
    vi.spyOn(repository, 'listApprovedItems').mockResolvedValue([
      {
        hashItemId: 'item-1',
        addedByAgentId: 'agent-1',
        createdAt: '2026-04-08T08:00:00.000Z',
      },
    ]);
    vi.spyOn(repository, 'listRecentOrdersFeed').mockResolvedValue({
      entries: [
        {
          compositionSignature: 'item-1:2:kg',
          lines: [{ itemId: 'item-1', itemName: 'Ribeye Steak', quantity: 2, unit: 'kg' }],
          lastOrderedAt: '2026-04-07T10:00:00.000Z',
          orderCount: 1,
        },
      ],
      total: 1,
      pageSize: 12,
      sortBy: 'lastOrderedAt_desc_compositionSignature_asc',
      generatedAt: '2026-04-08T10:00:00.000Z',
      windowStartAt: '2025-04-08T10:00:00.000Z',
    });
    vi.spyOn(erpGateway, 'getCustomerRecentItems').mockResolvedValue({
      source: 'hashavshevet',
      syncedAt: '2026-04-08T10:00:00.000Z',
      items: [
        {
          itemId: 'item-1',
          name: 'Ribeye Steak',
          lastOrderedAt: '2026-04-07T10:00:00.000Z',
        },
      ],
    });
    vi.spyOn(erpGateway, 'getCustomerPricing').mockResolvedValue({
      source: 'hashavshevet',
      syncedAt: '2026-04-08T10:00:00.000Z',
      version: 'price-v2',
      lines: [
        {
          itemId: 'item-1',
          unitPrice: 42.5,
          currency: 'ILS',
        },
      ],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/customer/sessions/activate',
      headers: {
        'x-forwarded-for': '198.51.100.10',
      },
      payload: {
        token: 'plain-token',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sessionToken: expect.any(String),
      customer: {
        customerId: 'cust-10',
      },
      approvedItems: [
        {
          hashItemId: 'item-1',
        },
      ],
      recentItems: [
        {
          itemId: 'item-1',
        },
      ],
      recentOrders: {
        entries: [
          {
            compositionSignature: 'item-1:2:kg',
          },
        ],
        total: 1,
      },
      pricing: [
        {
          itemId: 'item-1',
          unitPrice: 42.5,
          currency: 'ILS',
        },
      ],
      priceListVersion: 'price-v2',
      sessionExpiresAt: '2026-04-08T14:00:00.000Z',
    });
  });

  it('rejects invalid activation token with explicit error', async () => {
    const repository = app.get<CustomerSessionsRepository>(CUSTOMER_SESSIONS_REPOSITORY);
    vi.spyOn(repository, 'activateMagicToken').mockResolvedValue({ kind: 'invalid' });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/customer/sessions/activate',
      headers: {
        'x-forwarded-for': '198.51.100.11',
      },
      payload: {
        token: 'bad-token',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: 'CUSTOMER_SESSION_ACTIVATION_TOKEN_INVALID',
      message: 'Activation token is invalid',
    });
  });

  it('rejects expired activation token with explicit error', async () => {
    const repository = app.get<CustomerSessionsRepository>(CUSTOMER_SESSIONS_REPOSITORY);
    vi.spyOn(repository, 'activateMagicToken').mockResolvedValue({ kind: 'expired' });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/customer/sessions/activate',
      headers: {
        'x-forwarded-for': '198.51.100.12',
      },
      payload: {
        token: 'expired-token',
      },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toEqual({
      code: 'CUSTOMER_SESSION_ACTIVATION_TOKEN_EXPIRED',
      message: 'Activation token has expired',
    });
  });

  it('returns refreshed portal data for authenticated active sessions', async () => {
    const repository = app.get<CustomerSessionsRepository>(CUSTOMER_SESSIONS_REPOSITORY);
    const erpGateway = app.get<ErpGateway>(ERP_GATEWAY);
    vi.spyOn(repository, 'validateCustomerSession').mockResolvedValue({
      kind: 'valid',
      sessionId: 'sess-12',
      customerId: 'cust-12',
      sessionExpiresAt: new Date('2026-04-08T14:00:00.000Z'),
    });
    vi.spyOn(repository, 'listApprovedItems').mockResolvedValue([
      {
        hashItemId: 'item-9',
        addedByAgentId: 'agent-9',
        createdAt: '2026-04-08T09:00:00.000Z',
      },
    ]);
    vi.spyOn(repository, 'listRecentOrdersFeed').mockResolvedValue({
      entries: [
        {
          compositionSignature: 'item-9:1:kg',
          lines: [{ itemId: 'item-9', itemName: 'Ground Beef Premium', quantity: 1, unit: 'kg' }],
          lastOrderedAt: '2026-04-08T07:00:00.000Z',
          orderCount: 2,
        },
      ],
      total: 1,
      pageSize: 12,
      sortBy: 'lastOrderedAt_desc_compositionSignature_asc',
      generatedAt: '2026-04-08T10:00:00.000Z',
      windowStartAt: '2025-04-08T10:00:00.000Z',
    });
    vi.spyOn(erpGateway, 'getCustomerRecentItems').mockResolvedValue({
      source: 'hashavshevet',
      syncedAt: '2026-04-08T10:00:00.000Z',
      items: [
        {
          itemId: 'item-9',
          name: 'Ground Beef Premium',
          lastOrderedAt: '2026-04-08T07:00:00.000Z',
        },
      ],
    });
    vi.spyOn(erpGateway, 'getCustomerPricing').mockResolvedValue({
      source: 'hashavshevet',
      syncedAt: '2026-04-08T10:00:00.000Z',
      version: 'price-v3',
      lines: [
        {
          itemId: 'item-9',
          unitPrice: 55,
          currency: 'ILS',
        },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/customer/portal-data',
      headers: {
        authorization: `Bearer ${signCustomerToken('sess-12', 'cust-12')}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      customer: {
        customerId: 'cust-12',
      },
      priceListVersion: 'price-v3',
      approvedItems: [
        {
          hashItemId: 'item-9',
        },
      ],
      recentItems: [
        {
          itemId: 'item-9',
        },
      ],
      recentOrders: {
        entries: [
          {
            compositionSignature: 'item-9:1:kg',
          },
        ],
        total: 1,
      },
      pricing: [
        {
          itemId: 'item-9',
          unitPrice: 55,
        },
      ],
      sessionExpiresAt: '2026-04-08T14:00:00.000Z',
    });
  });

  it('closes customer session via authenticated logout endpoint', async () => {
    const repository = app.get<CustomerSessionsRepository>(CUSTOMER_SESSIONS_REPOSITORY);
    vi.spyOn(repository, 'validateCustomerSession').mockResolvedValue({
      kind: 'valid',
      sessionId: 'sess-logout',
      customerId: 'cust-logout',
      sessionExpiresAt: new Date('2026-04-08T14:00:00.000Z'),
    });
    const deactivateSpy = vi
      .spyOn(repository, 'deactivateCustomerSession')
      .mockResolvedValue(undefined);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/customer/session/logout',
      headers: {
        authorization: `Bearer ${signCustomerToken('sess-logout', 'cust-logout')}`,
      },
    });

    expect(response.statusCode).toBe(204);
    expect(deactivateSpy).toHaveBeenCalledWith(
      'sess-logout',
      'cust-logout',
      expect.any(Date),
    );
  });

  it('rejects expired customer session tokens on portal-data', async () => {
    const repository = app.get<CustomerSessionsRepository>(CUSTOMER_SESSIONS_REPOSITORY);
    vi.spyOn(repository, 'validateCustomerSession').mockResolvedValue({
      kind: 'expired',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/customer/portal-data',
      headers: {
        authorization: `Bearer ${signCustomerToken('sess-13', 'cust-13')}`,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: 'AUTH_CUSTOMER_SESSION_EXPIRED',
      message: 'Customer session has expired',
    });
  });

  it('rejects invalid customer session tokens on portal-data', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/customer/portal-data',
      headers: {
        authorization: 'Bearer malformed-token',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: 'AUTH_CUSTOMER_SESSION_TOKEN_INVALID',
      message: 'Customer session token is invalid',
    });
  });

  it('throttles repeated activation attempts from the same IP with stable 429 payload', async () => {
    const repository = app.get<CustomerSessionsRepository>(CUSTOMER_SESSIONS_REPOSITORY);
    vi.spyOn(repository, 'activateMagicToken').mockResolvedValue({ kind: 'invalid' });

    const first = await app.inject({
      method: 'POST',
      url: '/v1/customer/sessions/activate',
      headers: {
        'x-forwarded-for': '203.0.113.77',
      },
      payload: {
        token: 'invalid-1',
      },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/v1/customer/sessions/activate',
      headers: {
        'x-forwarded-for': '203.0.113.77',
      },
      payload: {
        token: 'invalid-2',
      },
    });
    const third = await app.inject({
      method: 'POST',
      url: '/v1/customer/sessions/activate',
      headers: {
        'x-forwarded-for': '203.0.113.77',
      },
      payload: {
        token: 'invalid-3',
      },
    });

    expect(first.statusCode).toBe(401);
    expect(second.statusCode).toBe(401);
    expect(third.statusCode).toBe(429);
    expect(third.json()).toEqual({
      code: 'CUSTOMER_SESSION_ACTIVATION_RATE_LIMITED',
      message: 'Too many activation attempts. Try again later.',
      retryAfterSeconds: 1,
    });
  });

  it('allows activation attempts again after the rate-limit window resets', async () => {
    const repository = app.get<CustomerSessionsRepository>(CUSTOMER_SESSIONS_REPOSITORY);
    vi.spyOn(repository, 'activateMagicToken').mockResolvedValue({ kind: 'invalid' });

    const first = await app.inject({
      method: 'POST',
      url: '/v1/customer/sessions/activate',
      headers: {
        'x-forwarded-for': '203.0.113.88',
      },
      payload: {
        token: 'invalid-1',
      },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/v1/customer/sessions/activate',
      headers: {
        'x-forwarded-for': '203.0.113.88',
      },
      payload: {
        token: 'invalid-2',
      },
    });
    const throttled = await app.inject({
      method: 'POST',
      url: '/v1/customer/sessions/activate',
      headers: {
        'x-forwarded-for': '203.0.113.88',
      },
      payload: {
        token: 'invalid-3',
      },
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 1_100);
    });

    const afterWindowReset = await app.inject({
      method: 'POST',
      url: '/v1/customer/sessions/activate',
      headers: {
        'x-forwarded-for': '203.0.113.88',
      },
      payload: {
        token: 'invalid-4',
      },
    });

    expect(first.statusCode).toBe(401);
    expect(second.statusCode).toBe(401);
    expect(throttled.statusCode).toBe(429);
    expect(afterWindowReset.statusCode).toBe(401);
  });
});

function signCustomerToken(sessionId: string, customerId: string): string {
  return jwt.sign(
    {
      sub: sessionId,
      customerId,
      type: 'customer_session',
    },
    process.env.JWT_SECRET!,
    {
      algorithm: 'HS256',
      issuer: process.env.JWT_ISSUER,
      expiresIn: '15m',
    },
  );
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
