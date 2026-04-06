import { Inject, Injectable } from '@nestjs/common';
import type { AgentCustomersResponse } from '@meatland/shared-types';

import { AGENT_CUSTOMERS_REPOSITORY } from './customers.constants';
import type { AgentCustomersRepository } from './customers.types';

@Injectable()
export class CustomersService {
  constructor(
    @Inject(AGENT_CUSTOMERS_REPOSITORY) private readonly customersRepository: AgentCustomersRepository,
  ) {}

  async getAssignedCustomers(agentId: string): Promise<AgentCustomersResponse> {
    const customers = await this.customersRepository.listAssignedCustomers(agentId);

    return {
      customers,
      total: customers.length,
      generatedAt: new Date().toISOString(),
    };
  }
}
