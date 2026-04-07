import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  AgentApprovedItemMutationResponse,
  AgentApprovedItemsResponse,
  AgentCustomersResponse,
} from '@meatland/shared-types';

import { isErpGatewayError } from '../erp/erp.errors';
import { ERP_GATEWAY, type ErpGateway } from '../erp/erp.gateway';
import { AGENT_CUSTOMERS_REPOSITORY } from './customers.constants';
import { AgentAssignmentRequiredError } from './customers.errors';
import type { AgentCustomersRepository } from './customers.types';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @Inject(AGENT_CUSTOMERS_REPOSITORY) private readonly customersRepository: AgentCustomersRepository,
    @Inject(ERP_GATEWAY) private readonly erpGateway: ErpGateway,
  ) {}

  async getAssignedCustomers(agentId: string): Promise<AgentCustomersResponse> {
    const [customers] = await Promise.all([
      this.customersRepository.listAssignedCustomers(agentId),
      this.erpGateway.getAssignedCustomers(agentId).catch((error: unknown) => {
        if (!isErpGatewayError(error)) {
          throw error;
        }

        const detail = error instanceof Error ? error.message : 'unknown error';
        this.logger.warn(`Hashavshevet assigned-customer pull failed for agent ${agentId}: ${detail}`);
        return null;
      }),
    ]);

    return {
      customers,
      total: customers.length,
      generatedAt: new Date().toISOString(),
    };
  }

  async getApprovedItems(agentId: string, customerId: string): Promise<AgentApprovedItemsResponse> {
    await this.assertAssignedCustomer(agentId, customerId);
    const items = await this.customersRepository.listApprovedItems(customerId);

    return {
      customerId,
      items,
      total: items.length,
      generatedAt: new Date().toISOString(),
    };
  }

  async addApprovedItem(
    agentId: string,
    customerId: string,
    hashItemId: string,
  ): Promise<AgentApprovedItemMutationResponse> {
    await this.assertAssignedCustomer(agentId, customerId);
    const result = await this.customersRepository.addApprovedItem(customerId, hashItemId, agentId);

    return {
      customerId,
      item: result.item,
      created: result.created,
    };
  }

  private async assertAssignedCustomer(agentId: string, customerId: string): Promise<void> {
    const isAssigned = await this.customersRepository.isAgentAssignedToCustomer(agentId, customerId);

    if (!isAssigned) {
      throw new AgentAssignmentRequiredError();
    }
  }
}
