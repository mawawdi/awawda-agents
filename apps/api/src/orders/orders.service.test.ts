import { describe, expect, it, vi } from 'vitest';

import { ERP_ERROR_CODES, ErpGatewayError } from '../erp/erp.errors';
import type { ErpGateway } from '../erp/erp.gateway';
import type { CustomerSessionsRepository } from '../sessions/sessions.types';
import {
  CUSTOMER_ORDER_ERP_UNAVAILABLE_CODE,
  CUSTOMER_ORDER_ERP_UNAVAILABLE_MESSAGE,
  CustomerOrderIdempotencyKeyConflictError,
} from './orders.errors';
import { OrdersService } from './orders.service';
import type { OrdersRepository } from './orders.types';

describe('OrdersService', () => {
  it('submits valid order, persists snapshots, and closes customer session', async () => {
    const erpGateway: ErpGateway = {
      handoffOrder: vi.fn().mockResolvedValue({
        status: 'submitted',
        provider: 'hashavshevet',
        externalRef: 'ORD-2026-00077',
        acceptedAt: '2026-04-10T11:00:00.000Z',
      }),
      getHealth: vi.fn(),
      getAssignedCustomers: vi.fn(),
      getMasterCatalog: vi.fn(),
      getCustomerRecentItems: vi.fn().mockResolvedValue({
        source: 'hashavshevet',
        syncedAt: '2026-04-10T10:55:00.000Z',
        items: [
          {
            itemId: 'item-1',
            name: 'Ribeye Steak',
            lastOrderedAt: '2026-04-09T09:00:00.000Z',
          },
        ],
      }),
      getCustomerPricing: vi.fn().mockResolvedValue({
        source: 'hashavshevet',
        syncedAt: '2026-04-10T10:56:00.000Z',
        version: 'v4',
        lines: [
          {
            itemId: 'item-1',
            unitPrice: 49.9,
            currency: 'ILS',
          },
        ],
      }),
    };

    const sessionsRepository: CustomerSessionsRepository = {
      activateMagicToken: vi.fn(),
      validateCustomerSession: vi.fn(),
      deactivateCustomerSession: vi.fn(),
      recordActivationAttempt: vi.fn(),
      listApprovedItems: vi.fn().mockResolvedValue([
        {
          hashItemId: 'item-1',
          addedByAgentId: 'agent-1',
          createdAt: '2026-04-01T09:00:00.000Z',
        },
      ]),
    };

    const ordersRepository: OrdersRepository = {
      reserveIdempotencyKey: vi.fn().mockResolvedValue({
        kind: 'reserved',
        idempotencyId: 'idem-row-1',
      }),
      persistOrderSubmission: vi.fn().mockResolvedValue(undefined),
      finalizeIdempotencyKey: vi.fn().mockResolvedValue(undefined),
    };

    const service = new OrdersService(erpGateway, sessionsRepository, ordersRepository);

    const result = await service.submitOrder(
      {
        customerId: 'cust-7',
        customerSessionId: 'sess-7',
        idempotencyKey: 'idem-777',
      },
      {
        lines: [
          {
            itemId: 'item-1',
            quantity: 2,
            unit: 'kg',
            clientUnitPrice: 49.9,
          },
        ],
      },
    );

    expect(result.statusCode).toBe(201);
    expect(result.body).toMatchObject({
      orderRef: 'ORD-2026-00077',
      status: 'submitted',
    });
    expect(erpGateway.handoffOrder).toHaveBeenCalledTimes(1);
    expect(ordersRepository.persistOrderSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        customerSessionId: 'sess-7',
        consumeSession: true,
      }),
    );
    expect(ordersRepository.finalizeIdempotencyKey).toHaveBeenCalledTimes(1);
  });

  it('returns 409 mismatch details when ERP price or scope diverges', async () => {
    const erpGateway: ErpGateway = {
      handoffOrder: vi.fn(),
      getHealth: vi.fn(),
      getAssignedCustomers: vi.fn(),
      getMasterCatalog: vi.fn(),
      getCustomerRecentItems: vi.fn().mockResolvedValue({
        source: 'hashavshevet',
        syncedAt: '2026-04-10T10:55:00.000Z',
        items: [],
      }),
      getCustomerPricing: vi.fn().mockResolvedValue({
        source: 'hashavshevet',
        syncedAt: '2026-04-10T10:56:00.000Z',
        version: 'v4',
        lines: [
          {
            itemId: 'item-1',
            unitPrice: 49.9,
            currency: 'ILS',
          },
        ],
      }),
    };

    const sessionsRepository: CustomerSessionsRepository = {
      activateMagicToken: vi.fn(),
      validateCustomerSession: vi.fn(),
      deactivateCustomerSession: vi.fn(),
      recordActivationAttempt: vi.fn(),
      listApprovedItems: vi.fn().mockResolvedValue([]),
    };

    const ordersRepository: OrdersRepository = {
      reserveIdempotencyKey: vi.fn().mockResolvedValue({
        kind: 'reserved',
        idempotencyId: 'idem-row-2',
      }),
      persistOrderSubmission: vi.fn().mockResolvedValue(undefined),
      finalizeIdempotencyKey: vi.fn().mockResolvedValue(undefined),
    };

    const service = new OrdersService(erpGateway, sessionsRepository, ordersRepository);

    const result = await service.submitOrder(
      {
        customerId: 'cust-7',
        customerSessionId: 'sess-7',
        idempotencyKey: 'idem-778',
      },
      {
        lines: [
          {
            itemId: 'item-1',
            quantity: 2,
            unit: 'kg',
            clientUnitPrice: 45.2,
          },
        ],
      },
    );

    expect(result).toEqual({
      statusCode: 409,
      body: {
        code: 'ORDER_LINES_MISMATCH',
        lines: [
          {
            lineIndex: 0,
            itemId: 'item-1',
            reason: 'Item is no longer available in approved or recent scope',
          },
        ],
      },
    });
    expect(erpGateway.handoffOrder).not.toHaveBeenCalled();
    expect(ordersRepository.persistOrderSubmission).not.toHaveBeenCalled();
    expect(ordersRepository.finalizeIdempotencyKey).toHaveBeenCalledTimes(1);
  });

  it('replays stored response without duplicate ERP submit', async () => {
    const erpGateway: ErpGateway = {
      handoffOrder: vi.fn(),
      getHealth: vi.fn(),
      getAssignedCustomers: vi.fn(),
      getMasterCatalog: vi.fn(),
      getCustomerRecentItems: vi.fn(),
      getCustomerPricing: vi.fn(),
    };

    const sessionsRepository: CustomerSessionsRepository = {
      activateMagicToken: vi.fn(),
      validateCustomerSession: vi.fn(),
      deactivateCustomerSession: vi.fn(),
      recordActivationAttempt: vi.fn(),
      listApprovedItems: vi.fn(),
    };

    const ordersRepository: OrdersRepository = {
      reserveIdempotencyKey: vi.fn().mockResolvedValue({
        kind: 'replay',
        replay: {
          statusCode: 201,
          body: {
            orderId: 'order-7',
            orderRef: 'ORD-2026-00077',
            status: 'submitted',
          },
        },
      }),
      persistOrderSubmission: vi.fn(),
      finalizeIdempotencyKey: vi.fn(),
    };

    const service = new OrdersService(erpGateway, sessionsRepository, ordersRepository);

    await expect(
      service.submitOrder(
        {
          customerId: 'cust-7',
          customerSessionId: 'sess-7',
          idempotencyKey: 'idem-777',
        },
        {
          lines: [
            {
              itemId: 'item-1',
              quantity: 2,
              unit: 'kg',
              clientUnitPrice: 49.9,
            },
          ],
        },
      ),
    ).resolves.toEqual({
      statusCode: 201,
      body: {
        orderId: 'order-7',
        orderRef: 'ORD-2026-00077',
        status: 'submitted',
      },
    });

    expect(erpGateway.handoffOrder).not.toHaveBeenCalled();
    expect(sessionsRepository.listApprovedItems).not.toHaveBeenCalled();
    expect(ordersRepository.persistOrderSubmission).not.toHaveBeenCalled();
  });

  it('rejects conflicting idempotency-key reuse', async () => {
    const service = new OrdersService(
      {
        handoffOrder: vi.fn(),
        getHealth: vi.fn(),
        getAssignedCustomers: vi.fn(),
        getMasterCatalog: vi.fn(),
        getCustomerRecentItems: vi.fn(),
        getCustomerPricing: vi.fn(),
      },
      {
        activateMagicToken: vi.fn(),
        validateCustomerSession: vi.fn(),
        deactivateCustomerSession: vi.fn(),
        recordActivationAttempt: vi.fn(),
        listApprovedItems: vi.fn(),
      },
      {
        reserveIdempotencyKey: vi.fn().mockResolvedValue({ kind: 'conflict' }),
        persistOrderSubmission: vi.fn(),
        finalizeIdempotencyKey: vi.fn(),
      },
    );

    await expect(
      service.submitOrder(
        {
          customerId: 'cust-7',
          customerSessionId: 'sess-7',
          idempotencyKey: 'idem-777',
        },
        {
          lines: [
            {
              itemId: 'item-1',
              quantity: 2,
              unit: 'kg',
              clientUnitPrice: 49.9,
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(CustomerOrderIdempotencyKeyConflictError);
  });

  it('returns and persists actionable ERP error when ERP pricing snapshot fails', async () => {
    const finalizeIdempotencyKey = vi.fn();
    const service = new OrdersService(
      {
        handoffOrder: vi.fn(),
        getHealth: vi.fn(),
        getAssignedCustomers: vi.fn(),
        getMasterCatalog: vi.fn(),
        getCustomerRecentItems: vi.fn().mockResolvedValue({
          source: 'hashavshevet',
          syncedAt: '2026-04-10T10:55:00.000Z',
          items: [],
        }),
        getCustomerPricing: vi
          .fn()
          .mockRejectedValue(new ErpGatewayError(ERP_ERROR_CODES.ERP_UNAVAILABLE, 'Pricing API down')),
      },
      {
        activateMagicToken: vi.fn(),
        validateCustomerSession: vi.fn(),
        deactivateCustomerSession: vi.fn(),
        recordActivationAttempt: vi.fn(),
        listApprovedItems: vi.fn().mockResolvedValue([]),
      },
      {
        reserveIdempotencyKey: vi.fn().mockResolvedValue({
          kind: 'reserved',
          idempotencyId: 'idem-row-6',
        }),
        persistOrderSubmission: vi.fn(),
        finalizeIdempotencyKey,
      },
    );

    await expect(
      service.submitOrder(
        {
          customerId: 'cust-9',
          customerSessionId: 'sess-9',
          idempotencyKey: 'idem-999',
        },
        {
          lines: [
            {
              itemId: 'item-1',
              quantity: 1,
              unit: 'kg',
              clientUnitPrice: 49.9,
            },
          ],
        },
      ),
    ).resolves.toEqual({
      statusCode: 503,
      body: {
        code: CUSTOMER_ORDER_ERP_UNAVAILABLE_CODE,
        message: CUSTOMER_ORDER_ERP_UNAVAILABLE_MESSAGE,
      },
    });
    expect(finalizeIdempotencyKey).toHaveBeenCalledTimes(1);
  });
});
