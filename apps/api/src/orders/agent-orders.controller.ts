import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AgentOrderCancelResponse, AgentOrdersResponse } from '@awawda/shared-types';

import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { AgentOrderCancelDto } from './dto/agent-order-cancel.dto';
import { AgentOrdersQueryDto } from './dto/agent-orders-query.dto';
import { AgentOrdersService } from './agent-orders.service';

@Controller({ path: 'agent/orders', version: '1' })
@UseGuards(AgentAuthGuard)
export class AgentOrdersController {
  constructor(@Inject(AgentOrdersService) private readonly agentOrdersService: AgentOrdersService) {}

  @Get()
  listOrders(@Headers('x-agent-id') agentId: string, @Query() query: AgentOrdersQueryDto): Promise<AgentOrdersResponse> {
    return this.agentOrdersService.listAgentOrders({
      agentId,
      page: Number(query.page) || 1,
      pageSize: Number(query.pageSize) || 8,
      fromDate: query.fromDate,
      toDate: query.toDate,
      query: query.query,
    });
  }

  @Post(':orderId/cancel')
  @HttpCode(200)
  cancelOrder(
    @Headers('x-agent-id') agentId: string,
    @Param('orderId') orderId: string,
    @Body() body?: AgentOrderCancelDto,
  ): Promise<AgentOrderCancelResponse> {
    return this.agentOrdersService.cancelOrder(agentId, orderId, body?.reason);
  }
}
