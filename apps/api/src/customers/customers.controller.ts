import { Controller, Get, Headers, Inject, UseGuards } from '@nestjs/common';
import type { AgentCustomersResponse } from '@meatland/shared-types';

import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { CustomersService } from './customers.service';

@Controller({ path: 'agent/customers', version: '1' })
@UseGuards(AgentAuthGuard)
export class CustomersController {
  constructor(@Inject(CustomersService) private readonly customersService: CustomersService) {
    this.getAssignedCustomers = this.getAssignedCustomers.bind(this);
  }

  @Get()
  getAssignedCustomers(@Headers('x-agent-id') agentId: string): Promise<AgentCustomersResponse> {
    return this.customersService.getAssignedCustomers(agentId);
  }
}
