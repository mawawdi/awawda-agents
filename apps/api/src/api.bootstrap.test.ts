import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApp } from './server';

type ReadyRouteBody = {
  status: 'ready' | 'not_ready';
  service: 'api';
  version: 'v1';
  timestamp: string;
  readinessPolicy: {
    requiredMinimumStatus: 'degraded' | 'up';
  };
  checks: {
    postgres: { status: 'up' | 'degraded' | 'down'; required: boolean };
    redis: { status: 'up' | 'degraded' | 'down'; required: boolean };
    erp: { status: 'up' | 'degraded' | 'down'; required: boolean };
  };
};

describe('API bootstrap', () => {
  let app: NestFastifyApplication;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalJwtShiftTokenTtl = process.env.JWT_SHIFT_TOKEN_TTL;
  const originalCorsAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
    process.env.JWT_SHIFT_TOKEN_TTL = '8h';
    app = await createApiApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
    if (originalJwtShiftTokenTtl === undefined) {
      delete process.env.JWT_SHIFT_TOKEN_TTL;
    } else {
      process.env.JWT_SHIFT_TOKEN_TTL = originalJwtShiftTokenTtl;
    }
    if (originalCorsAllowedOrigins === undefined) {
      delete process.env.CORS_ALLOWED_ORIGINS;
    } else {
      process.env.CORS_ALLOWED_ORIGINS = originalCorsAllowedOrigins;
    }
  });

  it('serves health route on /v1/health', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      status: 'ok';
      service: 'api';
      version: 'v1';
      timestamp: string;
      uptimeSeconds: number;
      checks: {
        api: 'up';
      };
    };
    expect(body).toMatchObject({
      status: 'ok',
      service: 'api',
      version: 'v1',
      checks: {
        api: 'up',
      },
    });
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  it('serves readiness route on /v1/ready', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/ready',
    });

    const body = response.json() as ReadyRouteBody;
    expect(body).toMatchObject({
      service: 'api',
      version: 'v1',
      readinessPolicy: {
        requiredMinimumStatus: expect.stringMatching(/^(degraded|up)$/),
      },
      checks: {
        postgres: {
          status: expect.stringMatching(/^(up|degraded|down)$/),
          required: true,
        },
        redis: {
          status: expect.stringMatching(/^(up|degraded|down)$/),
          required: true,
        },
        erp: {
          status: expect.stringMatching(/^(up|degraded|down)$/),
          required: true,
        },
      },
    });
    expect(typeof body.timestamp).toBe('string');

    const scoreByStatus = { down: 0, degraded: 1, up: 2 } as const;
    const minimumScore = scoreByStatus[body.readinessPolicy.requiredMinimumStatus];
    const requiredChecksReady = Object.values(body.checks)
      .filter((check) => check.required === true)
      .every((check) => scoreByStatus[check.status] >= minimumScore);

    expect(response.statusCode).toBe(requiredChecksReady ? 200 : 503);
    expect(body.status).toBe(requiredChecksReady ? 'ready' : 'not_ready');
  });

  it('allows CORS preflight for Expo web origin', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/agent/auth/login',
      headers: {
        origin: 'http://localhost:8081',
        'access-control-request-method': 'POST',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8081');
  });

  it('applies baseline security headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['permissions-policy']).toContain('camera=()');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('enforces API request body size limits', async () => {
    const oversizedValue = 'x'.repeat(1_200_000);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent/auth/login',
      payload: {
        phoneOrEmail: oversizedValue,
        password: 'not-used',
      },
    });

    expect(response.statusCode).toBe(413);
  });
});
