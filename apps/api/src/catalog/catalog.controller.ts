import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Controller, Get, Inject, Res, UseGuards } from '@nestjs/common';
import type { AgentCatalogResponse } from '@awawda/shared-types';
import { createHash } from 'node:crypto';

import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { CatalogService } from './catalog.service';

@ApiTags('agent/catalog')
@ApiBearerAuth()
@Controller({ path: 'agent/catalog', version: '1' })
@UseGuards(AgentAuthGuard)
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalogService: CatalogService) {
    this.getCatalog = this.getCatalog.bind(this);
  }

  @Get()
  async getCatalog(
    @Res({ passthrough: true })
    reply: { header(name: string, value: string): void },
  ): Promise<AgentCatalogResponse> {
    const payload = await this.catalogService.getCatalog();

    reply.header('Cache-Control', `private, max-age=${payload.cache.ttlSeconds}`);
    reply.header('X-Cache-Status', payload.cache.status);
    reply.header('X-Cache-Generated-At', payload.cache.generatedAt);
    reply.header('X-Cache-Expires-At', payload.cache.expiresAt);
    reply.header('ETag', buildCatalogEtag(payload));

    return payload;
  }
}

function buildCatalogEtag(payload: AgentCatalogResponse): string {
  const hash = createHash('sha256').update(JSON.stringify(payload.items)).update(payload.cache.generatedAt).digest('hex');
  return `W/\"${hash.slice(0, 16)}\"`;
}
