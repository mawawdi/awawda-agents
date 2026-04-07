import { Inject, Injectable } from '@nestjs/common';

import {
  ERP_READY_PROBE,
  POSTGRES_READY_PROBE,
  READY_CONFIG,
  REDIS_READY_PROBE,
  type DependencyStatus,
  type ReadyConfig,
  type ReadyProbe,
} from './ready.constants';

export type ReadyResponse = {
  status: 'ready' | 'not_ready';
  service: 'api';
  version: 'v1';
  timestamp: string;
  readinessPolicy: {
    requiredMinimumStatus: ReadyConfig['requiredMinimumStatus'];
  };
  checks: {
    postgres: DependencyStatus;
    redis: DependencyStatus;
    erp: DependencyStatus;
  };
};

@Injectable()
export class ReadyService {
  constructor(
    @Inject(READY_CONFIG) private readonly config: ReadyConfig,
    @Inject(POSTGRES_READY_PROBE) private readonly postgresProbe: ReadyProbe,
    @Inject(REDIS_READY_PROBE) private readonly redisProbe: ReadyProbe,
    @Inject(ERP_READY_PROBE) private readonly erpProbe: ReadyProbe,
  ) {}

  async getStatus(): Promise<ReadyResponse> {
    const [postgres, redis, erp] = await Promise.all([
      this.postgresProbe.check(),
      this.redisProbe.check(),
      this.erpProbe.check(),
    ]);

    const checks: ReadyResponse['checks'] = {
      postgres: {
        ...postgres,
        required: true,
      },
      redis: {
        ...redis,
        required: true,
      },
      erp: {
        ...erp,
        required: true,
      },
    };

    const requiredChecks = [checks.postgres, checks.redis, checks.erp];
    const requiredThresholdScore = statusScore(this.config.requiredMinimumStatus);
    const isReady = requiredChecks.every((check) => statusScore(check.status) >= requiredThresholdScore);

    return {
      status: isReady ? 'ready' : 'not_ready',
      service: 'api',
      version: 'v1',
      timestamp: new Date().toISOString(),
      readinessPolicy: {
        requiredMinimumStatus: this.config.requiredMinimumStatus,
      },
      checks,
    };
  }
}

function statusScore(status: ReadyConfig['requiredMinimumStatus'] | DependencyStatus['status']): number {
  if (status === 'up') {
    return 2;
  }

  if (status === 'degraded') {
    return 1;
  }

  return 0;
}
