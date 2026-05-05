import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type {
  SupervisorAgentCreateResponse,
  SupervisorAgentAccessUpdateResponse,
  SupervisorAgentForceLogoutResponse,
  SupervisorAgentsResponse,
  SupervisorAuditLogResponse,
  SupervisorBulkReassignResponse,
  SupervisorCustomerAssignAgentResponse,
  SupervisorCustomerAssignmentsResponse,
  SupervisorCustomerProfileListResponse,
  SupervisorCustomerProfileUpdateResponse,
  SupervisorCustomerUnassignAgentResponse,
  SupervisorCustomersResponse,
  SupervisorOversightResponse,
} from '@awawda/shared-types';

import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { SupervisorAuthGuard } from '../auth/supervisor-auth.guard';
import { SupervisorAuditQueryDto } from './dto/supervisor-audit-query.dto';
import { SupervisorAssignAgentDto } from './dto/supervisor-assign-agent.dto';
import { SupervisorBulkReassignDto } from './dto/supervisor-bulk-reassign.dto';
import { SupervisorCreateAgentDto } from './dto/supervisor-create-agent.dto';
import { SupervisorForceLogoutDto } from './dto/supervisor-force-logout.dto';
import { SupervisorUpdateAgentAccessDto } from './dto/supervisor-update-agent-access.dto';
import { SupervisorUpdateCustomerProfileDto } from './dto/supervisor-update-customer-profile.dto';
import { SupervisorUnassignAgentDto } from './dto/supervisor-unassign-agent.dto';
import { SupervisorAssignmentAgentIdRequiredError } from './supervisor.errors';
import { SupervisorService } from './supervisor.service';

@ApiTags('supervisor')
@ApiBearerAuth()
@Controller({ path: 'supervisor', version: '1' })
@UseGuards(AgentAuthGuard, SupervisorAuthGuard)
export class SupervisorController {
  constructor(@Inject(SupervisorService) private readonly supervisorService: SupervisorService) {}

  @Get('agents')
  listAgents(): Promise<SupervisorAgentsResponse> {
    return this.supervisorService.listAgents();
  }

  @Post('agents')
  createAgent(
    @Headers('x-agent-id') supervisorAgentId: string,
    @Body() body: SupervisorCreateAgentDto,
  ): Promise<SupervisorAgentCreateResponse> {
    return this.supervisorService.createAgent(supervisorAgentId, body);
  }

  @Patch('agents/:agentId/access')
  @HttpCode(200)
  updateAgentAccess(
    @Headers('x-agent-id') supervisorAgentId: string,
    @Param('agentId') agentId: string,
    @Body() body: SupervisorUpdateAgentAccessDto,
  ): Promise<SupervisorAgentAccessUpdateResponse> {
    return this.supervisorService.updateAgentAccess(supervisorAgentId, agentId, body);
  }

  @Post('agents/:agentId/force-logout')
  @HttpCode(200)
  forceLogoutAgent(
    @Headers('x-agent-id') supervisorAgentId: string,
    @Param('agentId') agentId: string,
    @Body() body: SupervisorForceLogoutDto,
  ): Promise<SupervisorAgentForceLogoutResponse> {
    return this.supervisorService.forceLogoutAgent(supervisorAgentId, agentId, body);
  }

  @Get('customers')
  listCustomers(): Promise<SupervisorCustomersResponse> {
    return this.supervisorService.listCustomers();
  }

  @Get('oversight')
  getOversightSnapshot(): Promise<SupervisorOversightResponse> {
    return this.supervisorService.getOversightSnapshot();
  }

  @Post('customers/bulk-reassign')
  @HttpCode(200)
  bulkReassignCustomers(
    @Headers('x-agent-id') supervisorAgentId: string,
    @Body() body: SupervisorBulkReassignDto,
  ): Promise<SupervisorBulkReassignResponse> {
    return this.supervisorService.bulkReassignCustomers(supervisorAgentId, body);
  }

  @Get('customer-profiles')
  listCustomerProfiles(): Promise<SupervisorCustomerProfileListResponse> {
    return this.supervisorService.listCustomerProfiles();
  }

  @Get('customers/:customerId/assignments')
  listCustomerAssignments(@Param('customerId') customerId: string): Promise<SupervisorCustomerAssignmentsResponse> {
    return this.supervisorService.listCustomerAssignments(customerId);
  }

  @Get('audit')
  listAuditEntries(@Query() query: SupervisorAuditQueryDto): Promise<SupervisorAuditLogResponse> {
    return this.supervisorService.listAuditEntries({
      actorId: query.actorId,
      customerId: query.customerId,
      eventType: query.eventType,
      fromDate: query.fromDate,
      toDate: query.toDate,
      page: Number(query.page) || 1,
      pageSize: Number(query.pageSize) || 20,
    });
  }

  @Post('customers/:customerId/assignments')
  assignCustomerToAgent(
    @Headers('x-agent-id') supervisorAgentId: string,
    @Param('customerId') customerId: string,
    @Body() body: SupervisorAssignAgentDto,
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ): Promise<SupervisorCustomerAssignAgentResponse> {
    return this.supervisorService.assignCustomerToAgent(supervisorAgentId, customerId, body.agentId).then((result) => {
      response.status(result.created ? 201 : 200);
      return result;
    });
  }

  @Delete('customers/:customerId/assignments/:agentId')
  @HttpCode(200)
  unassignCustomerFromAgent(
    @Headers('x-agent-id') supervisorAgentId: string,
    @Param('customerId') customerId: string,
    @Param('agentId') agentId: string,
  ): Promise<SupervisorCustomerUnassignAgentResponse> {
    return this.unassignCustomerAssignment(supervisorAgentId, customerId, agentId);
  }

  @Delete('customers/:customerId/assignments')
  @HttpCode(200)
  unassignCustomerFromAgentFallback(
    @Headers('x-agent-id') supervisorAgentId: string,
    @Param('customerId') customerId: string,
    @Query('agentId') queryAgentId: string | undefined,
    @Body() body?: SupervisorUnassignAgentDto,
  ): Promise<SupervisorCustomerUnassignAgentResponse> {
    return this.unassignCustomerAssignment(supervisorAgentId, customerId, body?.agentId ?? queryAgentId);
  }

  @Patch('customers/:customerId/profile')
  @HttpCode(200)
  updateCustomerProfile(
    @Headers('x-agent-id') supervisorAgentId: string,
    @Param('customerId') customerId: string,
    @Body() body: SupervisorUpdateCustomerProfileDto,
  ): Promise<SupervisorCustomerProfileUpdateResponse> {
    return this.supervisorService.updateCustomerProfile(supervisorAgentId, customerId, body);
  }

  private unassignCustomerAssignment(
    supervisorAgentId: string,
    customerId: string,
    agentId: string | undefined,
  ): Promise<SupervisorCustomerUnassignAgentResponse> {
    const normalizedAgentId = agentId?.trim();
    if (!normalizedAgentId) {
      throw new SupervisorAssignmentAgentIdRequiredError();
    }

    return this.supervisorService.unassignCustomerFromAgent(supervisorAgentId, customerId, normalizedAgentId);
  }
}
