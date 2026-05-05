import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Post, Res, UseGuards } from '@nestjs/common';
import type {
  AgentApprovedItemMutationResponse,
  AgentApprovedItemRemoveResponse,
  AgentApprovedItemsResponse,
  AgentCustomersResponse,
} from '@awawda/shared-types';

import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { AddApprovedItemRequestDto } from './dto/add-approved-item-request.dto';
import { CustomersService } from './customers.service';

@ApiTags('agent/customers')
@ApiBearerAuth()
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

  @Get(':customerId/approved-items')
  getApprovedItems(
    @Headers('x-agent-id') agentId: string,
    @Param('customerId') customerId: string,
  ): Promise<AgentApprovedItemsResponse> {
    return this.customersService.getApprovedItems(agentId, customerId);
  }

  @Post(':customerId/approved-items')
  addApprovedItem(
    @Headers('x-agent-id') agentId: string,
    @Param('customerId') customerId: string,
    @Body() body: AddApprovedItemRequestDto,
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ): Promise<AgentApprovedItemMutationResponse> {
    return this.customersService.addApprovedItem(agentId, customerId, body.hashItemId).then((result) => {
      response.status(result.created ? 201 : 200);
      return result;
    });
  }

  @Delete(':customerId/approved-items/:hashItemId')
  @HttpCode(200)
  removeApprovedItem(
    @Headers('x-agent-id') agentId: string,
    @Param('customerId') customerId: string,
    @Param('hashItemId') hashItemId: string,
  ): Promise<AgentApprovedItemRemoveResponse> {
    return this.customersService.removeApprovedItem(agentId, customerId, hashItemId);
  }
}
