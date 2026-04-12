import { afterEach, describe, expect, it, vi } from 'vitest';

import { ERP_ERROR_CODES, ErpGatewayError } from '../erp/erp.errors';
import type { ErpGateway } from '../erp/erp.gateway';
import { AgentOrderCancelUnavailableError, AgentOrderNotFoundError } from './agent-orders.errors';
import { AgentOrdersService } from './agent-orders.service';
import type { AgentOrdersRepository } from './agent-orders.types';

describe('AgentOrdersService', () => {
  const originalHashEnv = process.env.HASH_ENV;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalHashEnv === undefined) {
      delete process.env.HASH_ENV;
    } else {
      process.env.HASH_ENV = originalHashEnv;
    }
  });

  it('returns paged order payload with safe page defaults', async () => {
    const ordersRepository: AgentOrdersRepository = {
      listAgentOrders: vi.fn().mockResolvedValue({
        total: 13,
        orders: [],
      }),
      findAgentOrderForCancel: vi.fn(),
      deleteOrder: vi.fn(),
    };

    const service = new AgentOrdersService(ordersRepository, createErpGatewayMock());

    const response = await service.listAgentOrders({
      agentId: 'agent-1',
      page: 0,
      pageSize: 0,
      query: 'ribeye',
    });

    expect(response).toMatchObject({
      page: 1,
      pageSize: 8,
      total: 13,
      totalPages: 2,
    });
    expect(vi.mocked(ordersRepository.listAgentOrders)).toHaveBeenCalledWith({
      agentId: 'agent-1',
      page: 1,
      pageSize: 8,
      query: 'ribeye',
    });
  });

  it('cancels order by local deletion in testing mode', async () => {
    process.env.HASH_ENV = 'testing';
    const ordersRepository: AgentOrdersRepository = {
      listAgentOrders: vi.fn(),
      findAgentOrderForCancel: vi.fn().mockResolvedValue({
        orderId: 'order-42',
        orderRef: 'ORD-42',
        customerId: 'cust-42',
        status: 'submitted',
      }),
      deleteOrder: vi.fn().mockResolvedValue(undefined),
    };
    const erpGateway = createErpGatewayMock();

    const service = new AgentOrdersService(ordersRepository, erpGateway);
    const response = await service.cancelOrder('agent-42', 'order-42');

    expect(response).toMatchObject({
      orderId: 'order-42',
      status: 'cancelled',
      mode: 'testing_local_delete',
      removed: true,
    });
    expect(erpGateway.cancelOrder).not.toHaveBeenCalled();
    expect(vi.mocked(ordersRepository.deleteOrder)).toHaveBeenCalledWith('order-42');
  });

  it('calls ERP cancellation in production before deleting the order locally', async () => {
    process.env.HASH_ENV = 'production';
    const ordersRepository: AgentOrdersRepository = {
      listAgentOrders: vi.fn(),
      findAgentOrderForCancel: vi.fn().mockResolvedValue({
        orderId: 'order-77',
        orderRef: 'ORD-77',
        customerId: 'cust-77',
        status: 'submitted',
      }),
      deleteOrder: vi.fn().mockResolvedValue(undefined),
    };
    const erpGateway = createErpGatewayMock();
    vi.mocked(erpGateway.cancelOrder!).mockResolvedValue({
      status: 'cancelled',
      provider: 'hashavshevet',
      externalRef: 'ORD-77',
      canceledAt: '2026-04-12T12:00:00.000Z',
    });

    const service = new AgentOrdersService(ordersRepository, erpGateway);
    const response = await service.cancelOrder('agent-77', 'order-77', 'לקוח ביטל');

    expect(response).toMatchObject({
      orderId: 'order-77',
      mode: 'hashavshevet',
      removed: true,
    });
    expect(erpGateway.cancelOrder).toHaveBeenCalledWith({
      orderId: 'order-77',
      orderRef: 'ORD-77',
      customerId: 'cust-77',
      reason: 'לקוח ביטל',
    });
    expect(vi.mocked(ordersRepository.deleteOrder)).toHaveBeenCalledWith('order-77');
  });

  it('returns service-unavailable cancellation error when ERP cancellation fails in production', async () => {
    process.env.HASH_ENV = 'production';
    const ordersRepository: AgentOrdersRepository = {
      listAgentOrders: vi.fn(),
      findAgentOrderForCancel: vi.fn().mockResolvedValue({
        orderId: 'order-91',
        orderRef: 'ORD-91',
        customerId: 'cust-91',
        status: 'submitted',
      }),
      deleteOrder: vi.fn(),
    };
    const erpGateway = createErpGatewayMock();
    vi.mocked(erpGateway.cancelOrder!).mockRejectedValue(
      new ErpGatewayError(ERP_ERROR_CODES.ERP_UNAVAILABLE, 'Hashavshevet unavailable'),
    );

    const service = new AgentOrdersService(ordersRepository, erpGateway);

    await expect(service.cancelOrder('agent-91', 'order-91')).rejects.toBeInstanceOf(
      AgentOrderCancelUnavailableError,
    );
    expect(vi.mocked(ordersRepository.deleteOrder)).not.toHaveBeenCalled();
  });

  it('returns not-found when order is outside agent scope', async () => {
    const ordersRepository: AgentOrdersRepository = {
      listAgentOrders: vi.fn(),
      findAgentOrderForCancel: vi.fn().mockResolvedValue(null),
      deleteOrder: vi.fn(),
    };
    const service = new AgentOrdersService(ordersRepository, createErpGatewayMock());

    await expect(service.cancelOrder('agent-404', 'order-404')).rejects.toBeInstanceOf(
      AgentOrderNotFoundError,
    );
  });
});

function createErpGatewayMock(): ErpGateway {
  return {
    handoffOrder: vi.fn(),
    cancelOrder: vi.fn(),
    getHealth: vi.fn(),
    getAssignedCustomers: vi.fn(),
    getMasterCatalog: vi.fn(),
    getCustomerRecentItems: vi.fn(),
    getCustomerPricing: vi.fn(),
  };
}
