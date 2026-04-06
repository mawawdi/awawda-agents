import { Injectable } from '@nestjs/common';

export type HealthResponse = {
  status: 'ok';
  service: 'api';
  version: 'v1';
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    api: 'up';
  };
};

@Injectable()
export class HealthService {
  getStatus(): HealthResponse {
    return {
      status: 'ok',
      service: 'api',
      version: 'v1',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      checks: {
        api: 'up',
      },
    };
  }
}
