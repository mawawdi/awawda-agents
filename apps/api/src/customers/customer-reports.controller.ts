import { Controller, Get, Headers, Inject, Param, UseGuards } from '@nestjs/common';
import type {
  AgentCustomerBalanceResponse,
  AgentCustomerDeliveryNotesResponse,
  AgentCustomerLedgerResponse,
  AgentCustomerSpecialPricingResponse,
} from '@awawda/shared-types';

import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { CustomerReportsService } from './customer-reports.service';

@Controller({ path: 'agent/customers', version: '1' })
@UseGuards(AgentAuthGuard)
export class CustomerReportsController {
  constructor(
    @Inject(CustomerReportsService) private readonly customerReportsService: CustomerReportsService,
  ) {}

  @Get(':customerId/balance')
  getCustomerBalance(
    @Headers('x-agent-id') agentId: string,
    @Param('customerId') customerId: string,
  ): Promise<AgentCustomerBalanceResponse> {
    return this.customerReportsService.getCustomerBalance(agentId, customerId);
  }

  @Get(':customerId/ledger')
  getCustomerLedger(
    @Headers('x-agent-id') agentId: string,
    @Param('customerId') customerId: string,
  ): Promise<AgentCustomerLedgerResponse> {
    return this.customerReportsService.getCustomerLedger(agentId, customerId);
  }

  @Get(':customerId/delivery-notes')
  getCustomerDeliveryNotes(
    @Headers('x-agent-id') agentId: string,
    @Param('customerId') customerId: string,
  ): Promise<AgentCustomerDeliveryNotesResponse> {
    return this.customerReportsService.getCustomerDeliveryNotes(agentId, customerId);
  }

  @Get(':customerId/special-pricing')
  getCustomerSpecialPricing(
    @Headers('x-agent-id') agentId: string,
    @Param('customerId') customerId: string,
  ): Promise<AgentCustomerSpecialPricingResponse> {
    return this.customerReportsService.getCustomerSpecialPricing(agentId, customerId);
  }
}
