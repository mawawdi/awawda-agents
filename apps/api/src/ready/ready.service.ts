import { Injectable } from '@nestjs/common';

type DependencyStatus = {
  status: 'unknown';
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
  getStatus(): ReadyResponse {
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
          status: 'unknown',
          required: true,
          detail: 'ERP connector readiness probe not implemented yet.',
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
