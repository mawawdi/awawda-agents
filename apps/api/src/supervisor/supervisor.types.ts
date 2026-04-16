import type {
  SupervisorAgentCreateRequest,
  SupervisorAgentCreateResponse,
  SupervisorAgentAccessUpdateRequest,
  SupervisorAgentAccessUpdateResponse,
  SupervisorAgentForceLogoutRequest,
  SupervisorAgentForceLogoutResponse,
  SupervisorAgentAssignment,
  SupervisorAgentOverview,
  SupervisorAuditEntry,
  SupervisorBulkReassignRequest,
  SupervisorBulkReassignResponse,
  SupervisorCustomerOverview,
  SupervisorCustomerProfile,
  SupervisorCustomerProfileUpdateRequest,
  SupervisorOversightResponse,
} from '@awawda/shared-types';

export type SupervisorAssignCustomerInput = {
  supervisorAgentId: string;
  customerId: string;
  agentId: string;
};

export type SupervisorUnassignCustomerInput = {
  supervisorAgentId: string;
  customerId: string;
  agentId: string;
};

export type SupervisorUpdateCustomerProfileInput = {
  supervisorAgentId: string;
  customerId: string;
  update: SupervisorCustomerProfileUpdateRequest;
};

export type SupervisorUpdateAgentAccessInput = {
  supervisorAgentId: string;
  agentId: string;
  update: SupervisorAgentAccessUpdateRequest;
};

export type SupervisorForceLogoutAgentInput = {
  supervisorAgentId: string;
  agentId: string;
  request: SupervisorAgentForceLogoutRequest;
};

export type SupervisorCreateAgentInput = {
  supervisorAgentId: string;
  request: SupervisorAgentCreateRequest;
};

export type SupervisorBulkReassignInput = {
  supervisorAgentId: string;
  request: SupervisorBulkReassignRequest;
};

export type SupervisorAuditQueryInput = {
  actorId?: string;
  customerId?: string;
  eventType?: string;
  fromDate?: string;
  toDate?: string;
  page: number;
  pageSize: number;
};

export interface SupervisorRepository {
  listAgents(): Promise<SupervisorAgentOverview[]>;
  createAgent(input: SupervisorCreateAgentInput): Promise<SupervisorAgentCreateResponse>;
  forceLogoutAgent(input: SupervisorForceLogoutAgentInput): Promise<SupervisorAgentForceLogoutResponse>;
  listCustomers(): Promise<SupervisorCustomerOverview[]>;
  getOversightSnapshot(): Promise<SupervisorOversightResponse>;
  listCustomerProfiles(): Promise<SupervisorCustomerProfile[]>;
  listCustomerAssignments(customerId: string): Promise<SupervisorAgentAssignment[]>;
  updateAgentAccess(input: SupervisorUpdateAgentAccessInput): Promise<SupervisorAgentAccessUpdateResponse>;
  bulkReassignCustomers(input: SupervisorBulkReassignInput): Promise<SupervisorBulkReassignResponse>;
  listAuditEntries(input: SupervisorAuditQueryInput): Promise<{ entries: SupervisorAuditEntry[]; total: number }>;
  assignCustomerToAgent(input: SupervisorAssignCustomerInput): Promise<{
    assignment: SupervisorAgentAssignment;
    created: boolean;
  }>;
  unassignCustomerFromAgent(input: SupervisorUnassignCustomerInput): Promise<{
    removed: boolean;
    removedAt: string;
  }>;
  updateCustomerProfile(input: SupervisorUpdateCustomerProfileInput): Promise<SupervisorCustomerProfile>;
}
