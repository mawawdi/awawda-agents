import type { AgentOrderCard } from '@awawda/shared-types';

export type AgentOrdersQuery = {
  agentId: string;
  page: number;
  pageSize: number;
  fromDate?: string;
  toDate?: string;
  query?: string;
};

export type AgentOrderRow = AgentOrderCard & {
  orderStatus: AgentOrderCard['status'];
};

export type AgentOrderForCancel = {
  orderId: string;
  orderRef: string | null;
  customerId: string;
  status: AgentOrderCard['status'];
};

export interface AgentOrdersRepository {
  listAgentOrders(input: AgentOrdersQuery): Promise<{ orders: AgentOrderRow[]; total: number }>;
  findAgentOrderForCancel(agentId: string, orderId: string): Promise<AgentOrderForCancel | null>;
  deleteOrder(orderId: string): Promise<void>;
}
