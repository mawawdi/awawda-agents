import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type {
  AgentErpAgentsResponse,
  AgentObligoResponse,
  AgentOpenDeliveryNotesResponse,
  AgentSpecialPricesResponse,
  AgentStockStatusResponse,
  AgentVendorsResponse,
} from '@awawda/shared-types';

import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { ReportsService } from './reports.service';

@Controller({ path: 'agent/reports', version: '1' })
@UseGuards(AgentAuthGuard)
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reportsService: ReportsService) {}

  @Get('obligo')
  getObligo(): Promise<AgentObligoResponse> {
    return this.reportsService.getObligo();
  }

  @Get('open-delivery-notes')
  getOpenDeliveryNotes(): Promise<AgentOpenDeliveryNotesResponse> {
    return this.reportsService.getOpenDeliveryNotes();
  }

  @Get('vendors')
  getVendors(): Promise<AgentVendorsResponse> {
    return this.reportsService.getVendors();
  }

  @Get('agents')
  getErpAgents(): Promise<AgentErpAgentsResponse> {
    return this.reportsService.getErpAgents();
  }

  @Get('stock-status')
  getStockStatus(): Promise<AgentStockStatusResponse> {
    return this.reportsService.getStockStatus();
  }

  @Get('special-prices')
  getSpecialPrices(): Promise<AgentSpecialPricesResponse> {
    return this.reportsService.getSpecialPrices();
  }
}
