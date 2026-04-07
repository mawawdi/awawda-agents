import { describe, expect, it } from 'vitest';

import type { DependencyHealthStatus, ReadyConfig, ReadyProbe } from './ready.constants';
import { ReadyService } from './ready.service';

describe('ReadyService', () => {
  it('returns ready when required dependencies meet degraded threshold', async () => {
    const service = createService(
      { requiredMinimumStatus: 'degraded', probeTimeoutMs: 1500, degradedLatencyMs: 400 },
      createProbe({ status: 'up', detail: 'postgres ok', latencyMs: 10 }),
      createProbe({ status: 'degraded', detail: 'redis slow', latencyMs: 700 }),
      createProbe({ status: 'up', detail: 'erp ok', latencyMs: 5 }),
    );

    const status = await service.getStatus();

    expect(status.status).toBe('ready');
    expect(status.checks.postgres.required).toBe(true);
    expect(status.checks.redis.status).toBe('degraded');
    expect(status.readinessPolicy.requiredMinimumStatus).toBe('degraded');
  });

  it('returns not_ready when degraded dependencies are below strict threshold', async () => {
    const service = createService(
      { requiredMinimumStatus: 'up', probeTimeoutMs: 1500, degradedLatencyMs: 400 },
      createProbe({ status: 'up', detail: 'postgres ok', latencyMs: 10 }),
      createProbe({ status: 'degraded', detail: 'redis slow', latencyMs: 700 }),
      createProbe({ status: 'up', detail: 'erp ok', latencyMs: 5 }),
    );

    const status = await service.getStatus();

    expect(status.status).toBe('not_ready');
    expect(status.readinessPolicy.requiredMinimumStatus).toBe('up');
  });

  it('returns not_ready when any required dependency is down', async () => {
    const service = createService(
      { requiredMinimumStatus: 'degraded', probeTimeoutMs: 1500, degradedLatencyMs: 400 },
      createProbe({ status: 'down', detail: 'postgres down' }),
      createProbe({ status: 'up', detail: 'redis ok', latencyMs: 3 }),
      createProbe({ status: 'up', detail: 'erp ok', latencyMs: 5 }),
    );

    const status = await service.getStatus();

    expect(status.status).toBe('not_ready');
    expect(status.checks.postgres.status).toBe('down');
  });
});

function createService(config: ReadyConfig, postgresProbe: ReadyProbe, redisProbe: ReadyProbe, erpProbe: ReadyProbe): ReadyService {
  return new ReadyService(config, postgresProbe, redisProbe, erpProbe);
}

function createProbe(result: { status: DependencyHealthStatus; detail: string; latencyMs?: number }): ReadyProbe {
  return {
    async check() {
      return result;
    },
  };
}
