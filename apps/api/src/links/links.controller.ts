import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Controller, Headers, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type { AgentMagicLinkIssueResponse } from '@awawda/shared-types';

import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { LinksService } from './links.service';

@ApiTags('agent/customers')
@ApiBearerAuth()
@Controller({ path: 'agent/customers/:customerId/magic-links', version: '1' })
@UseGuards(AgentAuthGuard)
export class LinksController {
  constructor(@Inject(LinksService) private readonly linksService: LinksService) {
    this.issueMagicLink = this.issueMagicLink.bind(this);
  }

  @Post()
  issueMagicLink(
    @Headers('x-agent-id') agentId: string,
    @Param('customerId') customerId: string,
  ): Promise<AgentMagicLinkIssueResponse> {
    return this.linksService.issueMagicLink(agentId, customerId);
  }
}
