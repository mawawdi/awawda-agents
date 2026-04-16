import { Inject, Injectable } from '@nestjs/common';
import type {
  SupervisorAgentCreateRequest,
  SupervisorAgentCreateResponse,
  SupervisorAgentAccessUpdateRequest,
  SupervisorAgentAccessUpdateResponse,
  SupervisorAgentForceLogoutRequest,
  SupervisorAgentForceLogoutResponse,
  SupervisorAgentsResponse,
  SupervisorAuditLogResponse,
  SupervisorBulkReassignRequest,
  SupervisorBulkReassignResponse,
  SupervisorCustomerAssignAgentResponse,
  SupervisorCustomerAssignmentsResponse,
  SupervisorCustomerProfileListResponse,
  SupervisorOversightResponse,
  SupervisorCustomerProfileUpdateRequest,
  SupervisorCustomerProfileUpdateResponse,
  SupervisorCustomerUnassignAgentResponse,
  SupervisorCustomersResponse,
} from '@awawda/shared-types';

import { SUPERVISOR_REPOSITORY } from './supervisor.constants';
import type { SupervisorRepository } from './supervisor.types';

@Injectable()
export class SupervisorService {
  constructor(@Inject(SUPERVISOR_REPOSITORY) private readonly supervisorRepository: SupervisorRepository) {}

  async listAgents(): Promise<SupervisorAgentsResponse> {
    const agents = await this.supervisorRepository.listAgents();
    return {
      agents,
      total: agents.length,
      generatedAt: new Date().toISOString(),
    };
  }

  createAgent(
    supervisorAgentId: string,
    request: SupervisorAgentCreateRequest,
  ): Promise<SupervisorAgentCreateResponse> {
    return this.supervisorRepository.createAgent({
      supervisorAgentId,
      request,
    });
  }

  forceLogoutAgent(
    supervisorAgentId: string,
    agentId: string,
    request: SupervisorAgentForceLogoutRequest,
  ): Promise<SupervisorAgentForceLogoutResponse> {
    return this.supervisorRepository.forceLogoutAgent({
      supervisorAgentId,
      agentId,
      request,
    });
  }

  async listCustomers(): Promise<SupervisorCustomersResponse> {
    const customers = await this.supervisorRepository.listCustomers();
    return {
      customers,
      total: customers.length,
      generatedAt: new Date().toISOString(),
    };
  }

  getOversightSnapshot(): Promise<SupervisorOversightResponse> {
    return this.supervisorRepository.getOversightSnapshot();
  }

  async listCustomerProfiles(): Promise<SupervisorCustomerProfileListResponse> {
    const customers = await this.supervisorRepository.listCustomerProfiles();
    return {
      customers,
      total: customers.length,
      generatedAt: new Date().toISOString(),
    };
  }

  async listCustomerAssignments(customerId: string): Promise<SupervisorCustomerAssignmentsResponse> {
    const assignments = await this.supervisorRepository.listCustomerAssignments(customerId);
    return {
      customerId,
      assignments,
      total: assignments.length,
      generatedAt: new Date().toISOString(),
    };
  }

  updateAgentAccess(
    supervisorAgentId: string,
    agentId: string,
    update: SupervisorAgentAccessUpdateRequest,
  ): Promise<SupervisorAgentAccessUpdateResponse> {
    return this.supervisorRepository.updateAgentAccess({
      supervisorAgentId,
      agentId,
      update,
    });
  }

  bulkReassignCustomers(
    supervisorAgentId: string,
    request: SupervisorBulkReassignRequest,
  ): Promise<SupervisorBulkReassignResponse> {
    return this.supervisorRepository.bulkReassignCustomers({
      supervisorAgentId,
      request,
    });
  }

  async listAuditEntries(input: {
    actorId?: string;
    customerId?: string;
    eventType?: string;
    fromDate?: string;
    toDate?: string;
    page: number;
    pageSize: number;
  }): Promise<SupervisorAuditLogResponse> {
    const page = input.page > 0 ? input.page : 1;
    const pageSize = input.pageSize > 0 ? input.pageSize : 20;
    const result = await this.supervisorRepository.listAuditEntries({
      ...input,
      page,
      pageSize,
    });

    return {
      entries: result.entries,
      page,
      pageSize,
      total: result.total,
      totalPages: result.total === 0 ? 1 : Math.ceil(result.total / pageSize),
      generatedAt: new Date().toISOString(),
    };
  }

  assignCustomerToAgent(
    supervisorAgentId: string,
    customerId: string,
    agentId: string,
  ): Promise<SupervisorCustomerAssignAgentResponse> {
    return this.supervisorRepository.assignCustomerToAgent({
      supervisorAgentId,
      customerId,
      agentId,
    }).then((result) => ({
      customerId,
      assignment: result.assignment,
      created: result.created,
    }));
  }

  async unassignCustomerFromAgent(
    supervisorAgentId: string,
    customerId: string,
    agentId: string,
  ): Promise<SupervisorCustomerUnassignAgentResponse> {
    const result = await this.supervisorRepository.unassignCustomerFromAgent({
      supervisorAgentId,
      customerId,
      agentId,
    });
    return {
      customerId,
      agentId,
      removed: result.removed,
      removedAt: result.removedAt,
    };
  }

  updateCustomerProfile(
    supervisorAgentId: string,
    customerId: string,
    update: SupervisorCustomerProfileUpdateRequest,
  ): Promise<SupervisorCustomerProfileUpdateResponse> {
    return this.supervisorRepository.updateCustomerProfile({
      supervisorAgentId,
      customerId,
      update,
    });
  }
}
