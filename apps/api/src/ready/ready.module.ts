import { Module } from '@nestjs/common';

import { ErpModule } from '../erp/erp.module';
import { ERP_READY_PROBE, POSTGRES_READY_PROBE, READY_CONFIG, REDIS_READY_PROBE, type ReadyConfig } from './ready.constants';
import { ReadyController } from './ready.controller';
import { ErpReadyProbe, PostgresReadyProbe, RedisReadyProbe } from './ready.probes';
import { ReadyService } from './ready.service';

const DEFAULT_READY_PROBE_TIMEOUT_MS = 1_500;
const DEFAULT_READY_DEGRADED_LATENCY_MS = 400;

@Module({
  imports: [ErpModule],
  controllers: [ReadyController],
  providers: [
    {
      provide: READY_CONFIG,
      useFactory: (): ReadyConfig => ({
        probeTimeoutMs: resolvePositiveNumber('READY_PROBE_TIMEOUT_MS', DEFAULT_READY_PROBE_TIMEOUT_MS),
        degradedLatencyMs: resolvePositiveNumber('READY_DEGRADED_LATENCY_MS', DEFAULT_READY_DEGRADED_LATENCY_MS),
        requiredMinimumStatus: resolveRequiredMinimumStatus(),
      }),
    },
    PostgresReadyProbe,
    RedisReadyProbe,
    ErpReadyProbe,
    {
      provide: POSTGRES_READY_PROBE,
      useExisting: PostgresReadyProbe,
    },
    {
      provide: REDIS_READY_PROBE,
      useExisting: RedisReadyProbe,
    },
    {
      provide: ERP_READY_PROBE,
      useExisting: ErpReadyProbe,
    },
    ReadyService,
  ],
})
export class ReadyModule {}

function resolvePositiveNumber(environmentKey: string, fallback: number): number {
  const value = Number(process.env[environmentKey]);
  if (Number.isFinite(value) && value > 0) {
    return value;
  }

  return fallback;
}

function resolveRequiredMinimumStatus(): ReadyConfig['requiredMinimumStatus'] {
  return process.env.READY_REQUIRED_MIN_STATUS === 'up' ? 'up' : 'degraded';
}
