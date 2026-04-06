import type { AgentAssignedCustomer } from '@meatland/shared-types';

export interface AgentCustomersRepository {
  listAssignedCustomers(agentId: string): Promise<AgentAssignedCustomer[]>;
}
