import { Inject, Injectable } from '@nestjs/common';
import type { AgentOrderCancelResponse, AgentOrdersResponse } from '@awawda/shared-types';

import { ERP_GATEWAY, type ErpGateway } from '../erp/erp.gateway';
import { isErpGatewayError } from '../erp/erp.errors';
import { AGENT_ORDERS_REPOSITORY } from './orders.constants';
import { AgentOrderCancelUnavailableError, AgentOrderNotFoundError } from './agent-orders.errors';
import type { AgentOrdersQuery, AgentOrdersRepository } from './agent-orders.types';

@Injectable()
export class AgentOrdersService {
  constructor(
    @Inject(AGENT_ORDERS_REPOSITORY) private readonly ordersRepository: AgentOrdersRepository,
    @Inject(ERP_GATEWAY) private readonly erpGateway: ErpGateway,
  ) {}

  async listAgentOrders(input: AgentOrdersQuery): Promise<AgentOrdersResponse> {
    const page = input.page > 0 ? input.page : 1;
    const pageSize = input.pageSize > 0 ? input.pageSize : 8;
    const result = await this.ordersRepository.listAgentOrders({
      ...input,
      page,
      pageSize,
    });

    return {
      orders: result.orders,
      page,
      pageSize,
      total: result.total,
      totalPages: result.total === 0 ? 1 : Math.ceil(result.total / pageSize),
      generatedAt: new Date().toISOString(),
    };
  }

  async cancelOrder(agentId: string, orderId: string, reason?: string): Promise<AgentOrderCancelResponse> {
    const order = await this.ordersRepository.findAgentOrderForCancel(agentId, orderId);
    if (!order) {
      throw new AgentOrderNotFoundError(orderId);
    }

    const isTestingMode = (process.env.HASH_ENV ?? 'testing').trim().toLowerCase() !== 'production';
    if (!isTestingMode) {
      if (!this.erpGateway.cancelOrder) {
        throw new AgentOrderCancelUnavailableError();
      }

      try {
        await this.erpGateway.cancelOrder({
          orderId: order.orderId,
          orderRef: order.orderRef,
          customerId: order.customerId,
          reason,
        });
      } catch (error) {
        if (isErpGatewayError(error)) {
          throw new AgentOrderCancelUnavailableError();
        }
        throw error;
      }
    }

    await this.ordersRepository.deleteOrder(order.orderId);

    return {
      orderId: order.orderId,
      removed: true,
      status: 'cancelled',
      canceledAt: new Date().toISOString(),
      mode: isTestingMode ? 'testing_local_delete' : 'hashavshevet',
    };
  }
}
