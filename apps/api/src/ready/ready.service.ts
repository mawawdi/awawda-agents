import { Inject, Injectable } from '@nestjs/common';

import { ERP_GATEWAY, type ErpGateway } from '../erp/erp.gateway';

type DependencyStatus = {
  status: 'unknown' | 'up' | 'degraded' | 'down';
  required: boolean;
  detail: string;
};

export type ReadyResponse = {
  status: 'ready';
  service: 'api';
  version: 'v1';
  timestamp: string;
  checks: {
    database: DependencyStatus;
    erp: DependencyStatus;
    queue: DependencyStatus;
  };
};

@Injectable()
export class ReadyService {
  constructor(@Inject(ERP_GATEWAY) private readonly erpGateway: ErpGateway) {}

  async getStatus(): Promise<ReadyResponse> {
    const erpHealth = await this.erpGateway.getHealth();

    return {
      status: 'ready',
      service: 'api',
      version: 'v1',
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          status: 'unknown',
          required: true,
          detail: 'Database readiness probe not implemented yet.',
        },
        erp: {
          status: erpHealth.status,
          required: true,
          detail: erpHealth.detail,
        },
        queue: {
          status: 'unknown',
          required: false,
          detail: 'Background queue readiness probe not implemented yet.',
        },
      },
    };
  }
}
