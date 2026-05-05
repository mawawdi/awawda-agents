import type { AgentApprovedItem } from '@awawda/shared-types';
import type { AgentAssignedCustomer } from '@awawda/shared-types';

export interface AgentCustomersRepository {
  listAssignedCustomers(agentId: string): Promise<AgentAssignedCustomer[]>;
  isAgentAssignedToCustomer(agentId: string, customerId: string): Promise<boolean>;
  listApprovedItems(customerId: string): Promise<AgentApprovedItem[]>;
  addApprovedItem(
    customerId: string,
    hashItemId: string,
    agentId: string,
  ): Promise<{ item: AgentApprovedItem; created: boolean }>;
  removeApprovedItem(
    customerId: string,
    hashItemId: string,
    agentId: string,
  ): Promise<{ removed: boolean }>;
}
