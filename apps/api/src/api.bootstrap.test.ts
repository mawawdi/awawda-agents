import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApp } from './server';

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

    const body = response.json();
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

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toMatchObject({
      status: 'ready',
      service: 'api',
      version: 'v1',
      checks: {
        database: {
          status: 'unknown',
          required: true,
        },
        erp: {
          status: 'degraded',
          required: true,
        },
        queue: {
          status: 'unknown',
          required: false,
        },
      },
    });
    expect(typeof body.timestamp).toBe('string');
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
});
