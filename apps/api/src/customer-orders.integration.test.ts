import jwt from 'jsonwebtoken';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ERP_ERROR_CODES, ErpGatewayError } from './erp/erp.errors';
import { ERP_GATEWAY, type ErpGateway } from './erp/erp.gateway';
import { ORDERS_REPOSITORY } from './orders/orders.constants';
import type { OrdersRepository } from './orders/orders.types';
import { createApiApp } from './server';
import { CUSTOMER_SESSIONS_REPOSITORY } from './sessions/sessions.constants';
import type { CustomerSessionsRepository } from './sessions/sessions.types';

describe('Customer order submit endpoint', () => {
  let app: NestFastifyApplication;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalJwtIssuer = process.env.JWT_ISSUER;
  const originalSessionTtl = process.env.CUSTOMER_SESSION_TOKEN_TTL;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'integration-test-secret';
    process.env.JWT_ISSUER = 'integration-suite';
    process.env.CUSTOMER_SESSION_TOKEN_TTL = '2h';

    app = await createApiApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    restoreEnv('JWT_SECRET', originalJwtSecret);
    restoreEnv('JWT_ISSUER', originalJwtIssuer);
    restoreEnv('CUSTOMER_SESSION_TOKEN_TTL', originalSessionTtl);
  });

  it('returns 201 for happy path and persists idempotency response', async () => {
    const sessionsRepository = app.get<CustomerSessionsRepository>(CUSTOMER_SESSIONS_REPOSITORY);
    const ordersRepository = app.get<OrdersRepository>(ORDERS_REPOSITORY);
    const erpGateway = app.get<ErpGateway>(ERP_GATEWAY);

    vi.spyOn(sessionsRepository, 'validateCustomerSession').mockResolvedValue({
      kind: 'valid',
      sessionId: 'sess-21',
      customerId: 'cust-21',
      sessionExpiresAt: new Date('2026-04-10T14:00:00.000Z'),
    });
    vi.spyOn(sessionsRepository, 'listApprovedItems').mockResolvedValue([
      {
        hashItemId: 'item-1',
        addedByAgentId: 'agent-1',
        createdAt: '2026-04-09T09:00:00.000Z',
      },
    ]);
    vi.spyOn(sessionsRepository, 'resolveSessionAgent').mockResolvedValue({
      agentId: 'agent-1',
      hashAgentId: null,
    });

    vi.spyOn(ordersRepository, 'reserveIdempotencyKey').mockResolvedValue({
      kind: 'reserved',
      idempotencyId: 'idem-row-1',
    });
    vi.spyOn(ordersRepository, 'persistOrderSubmission').mockResolvedValue(undefined);
    vi.spyOn(ordersRepository, 'finalizeIdempotencyKey').mockResolvedValue(undefined);

    vi.spyOn(erpGateway, 'getCustomerRecentItems').mockResolvedValue({
      source: 'hashavshevet',
      syncedAt: '2026-04-10T10:00:00.000Z',
      items: [
        {
          itemId: 'item-1',
          name: 'Ribeye Steak',
          lastOrderedAt: '2026-04-09T08:00:00.000Z',
        },
      ],
    });
    vi.spyOn(erpGateway, 'getCustomerPricing').mockResolvedValue({
      source: 'hashavshevet',
      syncedAt: '2026-04-10T10:00:00.000Z',
      version: 'price-v5',
      lines: [
        {
          itemId: 'item-1',
          unitPrice: 49.9,
          currency: 'ILS',
        },
      ],
    });
    vi.spyOn(erpGateway, 'handoffOrder').mockResolvedValue({
      status: 'submitted',
      provider: 'hashavshevet',
      externalRef: 'ORD-2026-00077',
      acceptedAt: '2026-04-10T10:10:00.000Z',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/customer/orders',
      headers: {
        authorization: `Bearer ${signCustomerToken('sess-21', 'cust-21')}`,
        'idempotency-key': 'idem-777',
      },
      payload: {
        lines: [
          {
            itemId: 'item-1',
            quantity: 2,
            unit: 'kg',
            clientUnitPrice: 49.9,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      orderId: expect.any(String),
      orderRef: 'ORD-2026-00077',
      status: 'submitted',
    });
    expect(erpGateway.handoffOrder).toHaveBeenCalledTimes(1);
    expect(ordersRepository.persistOrderSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        consumeSession: true,
      }),
    );
    expect(ordersRepository.finalizeIdempotencyKey).toHaveBeenCalledTimes(1);
  });

  it('returns 409 with line-level mismatch details', async () => {
    const sessionsRepository = app.get<CustomerSessionsRepository>(CUSTOMER_SESSIONS_REPOSITORY);
    const ordersRepository = app.get<OrdersRepository>(ORDERS_REPOSITORY);
    const erpGateway = app.get<ErpGateway>(ERP_GATEWAY);

    vi.spyOn(sessionsRepository, 'validateCustomerSession').mockResolvedValue({
      kind: 'valid',
      sessionId: 'sess-22',
      customerId: 'cust-22',
      sessionExpiresAt: new Date('2026-04-10T14:00:00.000Z'),
    });
    vi.spyOn(sessionsRepository, 'listApprovedItems').mockResolvedValue([
      {
        hashItemId: 'item-1',
        addedByAgentId: 'agent-1',
        createdAt: '2026-04-09T09:00:00.000Z',
      },
    ]);

    vi.spyOn(ordersRepository, 'reserveIdempotencyKey').mockResolvedValue({
      kind: 'reserved',
      idempotencyId: 'idem-row-2',
    });
    vi.spyOn(ordersRepository, 'finalizeIdempotencyKey').mockResolvedValue(undefined);

    vi.spyOn(erpGateway, 'getCustomerRecentItems').mockResolvedValue({
      source: 'hashavshevet',
      syncedAt: '2026-04-10T10:00:00.000Z',
      items: [
        {
          itemId: 'item-1',
          name: 'Ribeye Steak',
          lastOrderedAt: '2026-04-09T08:00:00.000Z',
        },
      ],
    });
    vi.spyOn(erpGateway, 'getCustomerPricing').mockResolvedValue({
      source: 'hashavshevet',
      syncedAt: '2026-04-10T10:00:00.000Z',
      version: 'price-v5',
      lines: [
        {
          itemId: 'item-1',
          unitPrice: 49.9,
          currency: 'ILS',
        },
      ],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/customer/orders',
      headers: {
        authorization: `Bearer ${signCustomerToken('sess-22', 'cust-22')}`,
        'idempotency-key': 'idem-778',
      },
      payload: {
        lines: [
          {
            itemId: 'item-1',
            quantity: 2,
            unit: 'kg',
            clientUnitPrice: 45.2,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: 'ORDER_LINES_MISMATCH',
      lines: [
        {
          lineIndex: 0,
          itemId: 'item-1',
          reason: 'ERP unit price changed from 45.20 to 49.90',
          submittedUnitPrice: 45.2,
          currentUnitPrice: 49.9,
        },
      ],
    });
    expect(erpGateway.handoffOrder).not.toHaveBeenCalled();
    expect(ordersRepository.finalizeIdempotencyKey).toHaveBeenCalledTimes(1);
  });

  it('replays duplicate idempotency-key submissions without duplicate ERP calls', async () => {
    const sessionsRepository = app.get<CustomerSessionsRepository>(CUSTOMER_SESSIONS_REPOSITORY);
    const ordersRepository = app.get<OrdersRepository>(ORDERS_REPOSITORY);
    const erpGateway = app.get<ErpGateway>(ERP_GATEWAY);

    vi.spyOn(sessionsRepository, 'validateCustomerSession').mockResolvedValue({
      kind: 'valid',
      sessionId: 'sess-23',
      customerId: 'cust-23',
      sessionExpiresAt: new Date('2026-04-10T14:00:00.000Z'),
    });
    vi.spyOn(sessionsRepository, 'listApprovedItems').mockResolvedValue([
      {
        hashItemId: 'item-1',
        addedByAgentId: 'agent-1',
        createdAt: '2026-04-09T09:00:00.000Z',
      },
    ]);
    vi.spyOn(sessionsRepository, 'resolveSessionAgent').mockResolvedValue({
      agentId: 'agent-1',
      hashAgentId: null,
    });

    vi.spyOn(ordersRepository, 'reserveIdempotencyKey')
      .mockResolvedValueOnce({
        kind: 'reserved',
        idempotencyId: 'idem-row-3',
      })
      .mockResolvedValueOnce({
        kind: 'replay',
        replay: {
          statusCode: 201,
          body: {
            orderId: 'order-23',
            orderRef: 'ORD-2026-00023',
            status: 'submitted',
          },
        },
      });
    vi.spyOn(ordersRepository, 'persistOrderSubmission').mockResolvedValue(undefined);
    vi.spyOn(ordersRepository, 'finalizeIdempotencyKey').mockResolvedValue(undefined);

    vi.spyOn(erpGateway, 'getCustomerRecentItems').mockResolvedValue({
      source: 'hashavshevet',
      syncedAt: '2026-04-10T10:00:00.000Z',
      items: [
        {
          itemId: 'item-1',
          name: 'Ribeye Steak',
          lastOrderedAt: '2026-04-09T08:00:00.000Z',
        },
      ],
    });
    vi.spyOn(erpGateway, 'getCustomerPricing').mockResolvedValue({
      source: 'hashavshevet',
      syncedAt: '2026-04-10T10:00:00.000Z',
      version: 'price-v5',
      lines: [
        {
          itemId: 'item-1',
          unitPrice: 49.9,
          currency: 'ILS',
        },
      ],
    });
    vi.spyOn(erpGateway, 'handoffOrder').mockResolvedValue({
      status: 'submitted',
      provider: 'hashavshevet',
      externalRef: 'ORD-2026-00023',
      acceptedAt: '2026-04-10T10:10:00.000Z',
    });

    const firstResponse = await app.inject({
      method: 'POST',
      url: '/v1/customer/orders',
      headers: {
        authorization: `Bearer ${signCustomerToken('sess-23', 'cust-23')}`,
        'idempotency-key': 'idem-779',
      },
      payload: {
        lines: [
          {
            itemId: 'item-1',
            quantity: 2,
            unit: 'kg',
            clientUnitPrice: 49.9,
          },
        ],
      },
    });

    const secondResponse = await app.inject({
      method: 'POST',
      url: '/v1/customer/orders',
      headers: {
        authorization: `Bearer ${signCustomerToken('sess-23', 'cust-23')}`,
        'idempotency-key': 'idem-779',
      },
      payload: {
        lines: [
          {
            itemId: 'item-1',
            quantity: 2,
            unit: 'kg',
            clientUnitPrice: 49.9,
          },
        ],
      },
    });

    expect(firstResponse.statusCode).toBe(201);
    expect(secondResponse.statusCode).toBe(201);
    expect(secondResponse.json()).toEqual({
      orderId: 'order-23',
      orderRef: 'ORD-2026-00023',
      status: 'submitted',
    });
    expect(erpGateway.handoffOrder).toHaveBeenCalledTimes(1);
  });

  it('returns actionable 503 when ERP pricing snapshot is unavailable', async () => {
    const sessionsRepository = app.get<CustomerSessionsRepository>(CUSTOMER_SESSIONS_REPOSITORY);
    const ordersRepository = app.get<OrdersRepository>(ORDERS_REPOSITORY);
    const erpGateway = app.get<ErpGateway>(ERP_GATEWAY);

    vi.spyOn(sessionsRepository, 'validateCustomerSession').mockResolvedValue({
      kind: 'valid',
      sessionId: 'sess-24',
      customerId: 'cust-24',
      sessionExpiresAt: new Date('2026-04-10T14:00:00.000Z'),
    });
    vi.spyOn(sessionsRepository, 'listApprovedItems').mockResolvedValue([
      {
        hashItemId: 'item-1',
        addedByAgentId: 'agent-1',
        createdAt: '2026-04-09T09:00:00.000Z',
      },
    ]);
    vi.spyOn(ordersRepository, 'reserveIdempotencyKey').mockResolvedValue({
      kind: 'reserved',
      idempotencyId: 'idem-row-4',
    });

    vi.spyOn(erpGateway, 'getCustomerRecentItems').mockResolvedValue({
      source: 'hashavshevet',
      syncedAt: '2026-04-10T10:00:00.000Z',
      items: [],
    });
    vi.spyOn(erpGateway, 'getCustomerPricing').mockRejectedValue(
      new ErpGatewayError(ERP_ERROR_CODES.ERP_UNAVAILABLE, 'pricing endpoint unavailable'),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/customer/orders',
      headers: {
        authorization: `Bearer ${signCustomerToken('sess-24', 'cust-24')}`,
        'idempotency-key': 'idem-780',
      },
      payload: {
        lines: [
          {
            itemId: 'item-1',
            quantity: 1,
            unit: 'kg',
            clientUnitPrice: 49.9,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      code: 'CUSTOMER_ORDER_ERP_UNAVAILABLE',
      message: 'Order service is temporarily unavailable. Please retry in a moment.',
    });
  });

  it('replays persisted 503 ERP outage response for duplicate idempotency retries', async () => {
    const sessionsRepository = app.get<CustomerSessionsRepository>(CUSTOMER_SESSIONS_REPOSITORY);
    const ordersRepository = app.get<OrdersRepository>(ORDERS_REPOSITORY);
    const erpGateway = app.get<ErpGateway>(ERP_GATEWAY);

    vi.spyOn(sessionsRepository, 'validateCustomerSession').mockResolvedValue({
      kind: 'valid',
      sessionId: 'sess-25',
      customerId: 'cust-25',
      sessionExpiresAt: new Date('2026-04-10T14:00:00.000Z'),
    });
    vi.spyOn(sessionsRepository, 'listApprovedItems').mockResolvedValue([]);

    vi.spyOn(ordersRepository, 'reserveIdempotencyKey')
      .mockResolvedValueOnce({
        kind: 'reserved',
        idempotencyId: 'idem-row-5',
      })
      .mockResolvedValueOnce({
        kind: 'replay',
        replay: {
          statusCode: 503,
          body: {
            code: 'CUSTOMER_ORDER_ERP_UNAVAILABLE',
            message: 'Order service is temporarily unavailable. Please retry in a moment.',
          },
        },
      });
    vi.spyOn(ordersRepository, 'finalizeIdempotencyKey').mockResolvedValue(undefined);

    vi.spyOn(erpGateway, 'getCustomerRecentItems').mockResolvedValue({
      source: 'hashavshevet',
      syncedAt: '2026-04-10T10:00:00.000Z',
      items: [],
    });
    vi.spyOn(erpGateway, 'getCustomerPricing').mockRejectedValue(
      new ErpGatewayError(ERP_ERROR_CODES.ERP_UNAVAILABLE, 'pricing endpoint unavailable'),
    );

    const firstResponse = await app.inject({
      method: 'POST',
      url: '/v1/customer/orders',
      headers: {
        authorization: `Bearer ${signCustomerToken('sess-25', 'cust-25')}`,
        'idempotency-key': 'idem-781',
      },
      payload: {
        lines: [
          {
            itemId: 'item-1',
            quantity: 1,
            unit: 'kg',
            clientUnitPrice: 49.9,
          },
        ],
      },
    });

    const secondResponse = await app.inject({
      method: 'POST',
      url: '/v1/customer/orders',
      headers: {
        authorization: `Bearer ${signCustomerToken('sess-25', 'cust-25')}`,
        'idempotency-key': 'idem-781',
      },
      payload: {
        lines: [
          {
            itemId: 'item-1',
            quantity: 1,
            unit: 'kg',
            clientUnitPrice: 49.9,
          },
        ],
      },
    });

    expect(firstResponse.statusCode).toBe(503);
    expect(secondResponse.statusCode).toBe(503);
    expect(secondResponse.json()).toEqual({
      code: 'CUSTOMER_ORDER_ERP_UNAVAILABLE',
      message: 'Order service is temporarily unavailable. Please retry in a moment.',
    });
    expect(erpGateway.getCustomerPricing).toHaveBeenCalledTimes(1);
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
