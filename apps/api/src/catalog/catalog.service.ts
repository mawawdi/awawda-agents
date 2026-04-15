import { Inject, Injectable } from '@nestjs/common';
import type { AgentCatalogResponse } from '@awawda/shared-types';

import { ERP_GATEWAY, type ErpGateway, type ErpGatewayCatalogSnapshot } from '../erp/erp.gateway';
import { CATALOG_CONFIG } from './catalog.constants';
import type { CatalogConfig } from './catalog.config';

type CatalogCacheEntry = {
  snapshot: ErpGatewayCatalogSnapshot;
  expiresAtMs: number;
};

@Injectable()
export class CatalogService {
  private cache: CatalogCacheEntry | null = null;

  constructor(
    @Inject(ERP_GATEWAY) private readonly erpGateway: ErpGateway,
    @Inject(CATALOG_CONFIG) private readonly config: CatalogConfig,
  ) {}

  async getCatalog(): Promise<AgentCatalogResponse> {
    const now = Date.now();
    const cached = this.cache;

    if (cached && cached.expiresAtMs > now) {
      return this.buildResponse(cached.snapshot, 'hit', cached.expiresAtMs);
    }

    const snapshot = await this.erpGateway.getMasterCatalog();
    const expiresAtMs = now + this.config.cacheTtlSeconds * 1000;

    this.cache = {
      snapshot,
      expiresAtMs,
    };

    return this.buildResponse(snapshot, 'miss', expiresAtMs);
  }

  private buildResponse(
    snapshot: ErpGatewayCatalogSnapshot,
    status: 'hit' | 'miss',
    expiresAtMs: number,
  ): AgentCatalogResponse {
    return {
      items: snapshot.items,
      source: snapshot.source,
      cache: {
        status,
        generatedAt: snapshot.syncedAt,
        expiresAt: new Date(expiresAtMs).toISOString(),
        ttlSeconds: this.config.cacheTtlSeconds,
      },
    };
  }
}
