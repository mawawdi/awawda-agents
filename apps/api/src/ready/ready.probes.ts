import { performance } from 'node:perf_hooks';
import { Socket, createConnection } from 'node:net';
import { connect as createTlsConnection, TLSSocket } from 'node:tls';

import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { ERP_GATEWAY, type ErpGateway } from '../erp/erp.gateway';
import { READY_CONFIG, type DependencyHealthStatus, type ReadyConfig, type ReadyProbe } from './ready.constants';

type ProbeTarget = {
  protocol: string;
  host: string;
  port: number;
};

@Injectable()
export class PostgresReadyProbe implements ReadyProbe {
  constructor(@Inject(READY_CONFIG) private readonly config: ReadyConfig) {}

  async check(): Promise<{ status: DependencyHealthStatus; detail: string; latencyMs?: number }> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return {
        status: 'down',
        detail: 'DATABASE_URL is not configured.',
      };
    }

    const parsedTarget = parseTarget(databaseUrl, ['postgres:', 'postgresql:'], 5432);
    if (!parsedTarget) {
      return {
        status: 'down',
        detail: 'DATABASE_URL is invalid.',
      };
    }

    const startedAt = performance.now();
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: withPostgresConnectTimeout(databaseUrl, this.config.probeTimeoutMs),
        },
      },
    });

    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
      return {
        status: applyLatencyThreshold('up', latencyMs, this.config.degradedLatencyMs),
        detail: `postgres probe query succeeded on ${parsedTarget.host}:${parsedTarget.port}.`,
        latencyMs,
      };
    } catch (error) {
      return {
        status: 'down',
        detail: `postgres probe query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    } finally {
      await prisma.$disconnect();
    }
  }
}

@Injectable()
export class RedisReadyProbe implements ReadyProbe {
  constructor(@Inject(READY_CONFIG) private readonly config: ReadyConfig) {}

  async check(): Promise<{ status: DependencyHealthStatus; detail: string; latencyMs?: number }> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      return {
        status: 'down',
        detail: 'REDIS_URL is not configured.',
      };
    }

    const parsedTarget = parseTarget(redisUrl, ['redis:', 'rediss:'], 6379);
    if (!parsedTarget) {
      return {
        status: 'down',
        detail: 'REDIS_URL is invalid.',
      };
    }

    return probeRedisPing(parsedTarget, this.config);
  }
}

@Injectable()
export class ErpReadyProbe implements ReadyProbe {
  constructor(
    @Inject(ERP_GATEWAY) private readonly erpGateway: ErpGateway,
    @Inject(READY_CONFIG) private readonly config: ReadyConfig,
  ) {}

  async check(): Promise<{ status: DependencyHealthStatus; detail: string; latencyMs?: number }> {
    const startedAt = performance.now();

    try {
      const health = await this.erpGateway.getHealth();
      const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
      const status = applyLatencyThreshold(health.status, latencyMs, this.config.degradedLatencyMs);
      return {
        status,
        detail: health.detail,
        latencyMs,
      };
    } catch (error) {
      return {
        status: 'down',
        detail: `ERP readiness probe failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

function parseTarget(urlValue: string, allowedProtocols: string[], defaultPort: number): ProbeTarget | null {
  try {
    const url = new URL(urlValue);
    if (!allowedProtocols.includes(url.protocol)) {
      return null;
    }

    return {
      protocol: url.protocol,
      host: url.hostname,
      port: Number(url.port) || defaultPort,
    };
  } catch {
    return null;
  }
}

function applyLatencyThreshold(
  status: DependencyHealthStatus,
  latencyMs: number,
  degradedLatencyMs: number,
): DependencyHealthStatus {
  if (status !== 'up') {
    return status;
  }

  return latencyMs > degradedLatencyMs ? 'degraded' : 'up';
}

function withPostgresConnectTimeout(databaseUrl: string, probeTimeoutMs: number): string {
  try {
    const url = new URL(databaseUrl);
    if (!url.searchParams.has('connect_timeout')) {
      url.searchParams.set('connect_timeout', String(Math.max(1, Math.ceil(probeTimeoutMs / 1000))));
    }

    return url.toString();
  } catch {
    return databaseUrl;
  }
}

async function probeRedisPing(
  target: ProbeTarget,
  config: ReadyConfig,
): Promise<{ status: DependencyHealthStatus; detail: string; latencyMs?: number }> {
  const startedAt = performance.now();

  return new Promise((resolve) => {
    let settled = false;
    let buffer = '';

    const socket: Socket | TLSSocket = target.protocol === 'rediss:'
      ? createTlsConnection({
        host: target.host,
        port: target.port,
      })
      : createConnection({
        host: target.host,
        port: target.port,
      });

    const finish = (result: { status: DependencyHealthStatus; detail: string; latencyMs?: number }): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutHandle);
      socket.destroy();
      resolve(result);
    };

    const timeoutHandle = setTimeout(() => {
      finish({
        status: 'down',
        detail: `redis probe timed out after ${config.probeTimeoutMs}ms.`,
      });
    }, config.probeTimeoutMs);

    socket.once('connect', () => {
      socket.write('*1\r\n$4\r\nPING\r\n');
    });

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      if (buffer.includes('+PONG')) {
        const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
        finish({
          status: applyLatencyThreshold('up', latencyMs, config.degradedLatencyMs),
          detail: `redis PING succeeded on ${target.host}:${target.port}.`,
          latencyMs,
        });
        return;
      }

      if (buffer.startsWith('-')) {
        finish({
          status: 'down',
          detail: `redis returned error response: ${buffer.trim()}`,
        });
      }
    });

    socket.once('error', (error) => {
      finish({
        status: 'down',
        detail: `redis probe failed: ${error.message}`,
      });
    });
  });
}
