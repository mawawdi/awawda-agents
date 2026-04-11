import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { BMaxXmlAdapter } from './bmax-xml.adapter';
import { CompositeErpGateway } from './composite-erp.gateway';
import { ERP_ERROR_CODES, ErpGatewayError } from './erp.errors';
import { ERP_GATEWAY } from './erp.gateway';
import { HashavshevetAdapter } from './hashavshevet.adapter';
import { createApiApp } from '../server';

describe('ERP module', () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalJwtShiftTokenTtl = process.env.JWT_SHIFT_TOKEN_TTL;

  beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
    process.env.JWT_SHIFT_TOKEN_TTL = process.env.JWT_SHIFT_TOKEN_TTL ?? '8h';
  });

  afterAll(() => {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }

    if (originalJwtShiftTokenTtl === undefined) {
      delete process.env.JWT_SHIFT_TOKEN_TTL;
    } else {
      process.env.JWT_SHIFT_TOKEN_TTL = originalJwtShiftTokenTtl;
    }
  });

  it('provides the ERP gateway abstraction token', async () => {
    const app = await createApiApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const gateway = app.get(ERP_GATEWAY);

    expect(gateway).toBeInstanceOf(CompositeErpGateway);

    await app.close();
  });

  it('falls back to B-MAX XML when Hashavshevet is unavailable', async () => {
    const gateway = new CompositeErpGateway(new HashavshevetAdapter(), new BMaxXmlAdapter());

    const response = await gateway.handoffOrder({
      orderId: '4dadf2f2-a619-4eb0-9db7-8817ed7fd98d',
      customerId: 'customer-17',
      lines: [
        {
          itemId: 'item-1',
          quantity: 2,
          unit: 'kg',
          clientUnitPrice: 10,
        },
      ],
    });

    expect(response).toMatchObject({
      status: 'pending_retry',
      provider: 'bmax_xml',
    });
    expect(response.externalRef).toMatch(/^bmax-queue:4dadf2f2-a619-4eb0-9db7-8817ed7fd98d:\d+$/);
  });

  it('falls back to B-MAX when Hashavshevet wraps a transient timeout failure', async () => {
    const hashavshevet = new HashavshevetAdapter();
    const bmax = new BMaxXmlAdapter();
    const hashavshevetSpy = vi.spyOn(hashavshevet, 'handoffOrder').mockRejectedValue(
      new ErpGatewayError(
        ERP_ERROR_CODES.ERP_ORDER_HANDOFF_FAILED,
        'handoff failed after retries',
        new ErpGatewayError(ERP_ERROR_CODES.ERP_TIMEOUT, 'timeout'),
      ),
    );
    const bmaxSpy = vi.spyOn(bmax, 'handoffOrder').mockResolvedValue({
      status: 'pending_retry',
      provider: 'bmax_xml',
      externalRef: 'bmax-queue:test-order:42',
      acceptedAt: '2026-05-01T10:00:00.000Z',
    });
    const gateway = new CompositeErpGateway(hashavshevet, bmax);

    await expect(
      gateway.handoffOrder({
        orderId: 'test-order',
        customerId: 'customer-18',
        lines: [{ itemId: 'item-1', quantity: 1, unit: 'kg', clientUnitPrice: 10 }],
      }),
    ).resolves.toEqual({
      status: 'pending_retry',
      provider: 'bmax_xml',
      externalRef: 'bmax-queue:test-order:42',
      acceptedAt: '2026-05-01T10:00:00.000Z',
    });

    expect(hashavshevetSpy).toHaveBeenCalledTimes(1);
    expect(bmaxSpy).toHaveBeenCalledTimes(1);
  });

  it('does not fallback to B-MAX when Hashavshevet returns non-fallback ERP errors', async () => {
    const hashavshevet = new HashavshevetAdapter();
    const bmax = new BMaxXmlAdapter();
    const hashavshevetSpy = vi
      .spyOn(hashavshevet, 'handoffOrder')
      .mockRejectedValue(new ErpGatewayError(ERP_ERROR_CODES.ERP_VALIDATION_FAILED, 'invalid payload'));
    const bmaxSpy = vi.spyOn(bmax, 'handoffOrder');
    const gateway = new CompositeErpGateway(hashavshevet, bmax);

    await expect(
      gateway.handoffOrder({
        orderId: '4dadf2f2-a619-4eb0-9db7-8817ed7fd98d',
        customerId: 'customer-19',
        lines: [
          {
            itemId: 'item-1',
            quantity: 1,
            unit: 'kg',
            clientUnitPrice: 10,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(ErpGatewayError);

    expect(hashavshevetSpy).toHaveBeenCalledTimes(1);
    expect(bmaxSpy).not.toHaveBeenCalled();
  });

  it('does not fallback to B-MAX when wrapped failure chain contains auth/validation errors', async () => {
    const hashavshevet = new HashavshevetAdapter();
    const bmax = new BMaxXmlAdapter();
    const hashavshevetSpy = vi.spyOn(hashavshevet, 'handoffOrder').mockRejectedValue(
      new ErpGatewayError(
        ERP_ERROR_CODES.ERP_ORDER_HANDOFF_FAILED,
        'handoff failed after retries',
        new ErpGatewayError(ERP_ERROR_CODES.ERP_AUTH_FAILED, 'signature invalid'),
      ),
    );
    const bmaxSpy = vi.spyOn(bmax, 'handoffOrder');
    const gateway = new CompositeErpGateway(hashavshevet, bmax);

    await expect(
      gateway.handoffOrder({
        orderId: 'wrapped-auth-failure',
        customerId: 'customer-20',
        lines: [{ itemId: 'item-1', quantity: 1, unit: 'kg', clientUnitPrice: 10 }],
      }),
    ).rejects.toMatchObject({
      code: ERP_ERROR_CODES.ERP_ORDER_HANDOFF_FAILED,
    } satisfies Partial<ErpGatewayError>);

    expect(hashavshevetSpy).toHaveBeenCalledTimes(1);
    expect(bmaxSpy).not.toHaveBeenCalled();
  });

  it('returns an explicit stable handoff response shape', async () => {
    const hashavshevet = new HashavshevetAdapter();
    const bmax = new BMaxXmlAdapter();
    vi.spyOn(hashavshevet, 'handoffOrder').mockRejectedValue(
      new ErpGatewayError(ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED, 'plugin not implemented'),
    );
    vi.spyOn(bmax, 'handoffOrder').mockResolvedValue({
      status: 'pending_retry',
      provider: 'bmax_xml',
      externalRef: 'bmax-queue:shape-check:12',
      acceptedAt: '2026-05-01T10:00:00.000Z',
      debugInfo: 'internal-only',
    } as unknown as Awaited<ReturnType<BMaxXmlAdapter['handoffOrder']>>);
    const gateway = new CompositeErpGateway(hashavshevet, bmax);

    const response = await gateway.handoffOrder({
      orderId: 'shape-check',
      customerId: 'customer-21',
      lines: [{ itemId: 'item-1', quantity: 1, unit: 'kg', clientUnitPrice: 10 }],
    });

    expect(response).toEqual({
      status: 'pending_retry',
      provider: 'bmax_xml',
      externalRef: 'bmax-queue:shape-check:12',
      acceptedAt: '2026-05-01T10:00:00.000Z',
    });
    expect(Object.keys(response).sort()).toEqual(['acceptedAt', 'externalRef', 'provider', 'status']);
  });
});
