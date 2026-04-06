import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApp } from './server';

describe('API bootstrap', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApiApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
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
          status: 'unknown',
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

  it('supports login, session restore, and logout lifecycle for agent auth', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/v1/agent/auth/login',
      payload: {
        email: 'agent@meatland.local',
        password: 'Password123!',
      },
    });

    expect(loginResponse.statusCode).toBe(201);
    const loginBody = loginResponse.json();
    expect(loginBody).toMatchObject({
      accessToken: expect.any(String),
      expiresIn: expect.any(Number),
      agentProfile: {
        agentId: 'agent-001',
        email: 'agent@meatland.local',
      },
    });

    const token = loginBody.accessToken as string;

    const sessionResponse = await app.inject({
      method: 'GET',
      url: '/v1/agent/auth/session',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionResponse.json()).toMatchObject({
      agentProfile: {
        agentId: 'agent-001',
        email: 'agent@meatland.local',
      },
    });

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/v1/agent/auth/logout',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(logoutResponse.statusCode).toBe(201);
    expect(logoutResponse.json()).toEqual({ success: true });

    const invalidatedSessionResponse = await app.inject({
      method: 'GET',
      url: '/v1/agent/auth/session',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(invalidatedSessionResponse.statusCode).toBe(401);
  });
});
