import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { createApiApp } from '../server';

describe('testing-assets production guardrails', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalHashEnv = process.env.HASH_ENV;
  const originalHashProdApiUrl = process.env.HASH_PROD_API_URL;
  const originalHashProdApiKey = process.env.HASH_PROD_API_KEY;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalHconnectEnabled = process.env.HASH_HCONNECT_ENABLED;

  afterEach(() => {
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('HASH_ENV', originalHashEnv);
    restoreEnv('HASH_PROD_API_URL', originalHashProdApiUrl);
    restoreEnv('HASH_PROD_API_KEY', originalHashProdApiKey);
    restoreEnv('JWT_SECRET', originalJwtSecret);
    restoreEnv('HASH_HCONNECT_ENABLED', originalHconnectEnabled);
  });

  it('serves testing-assets routes in testing mode', async () => {
    process.env.NODE_ENV = 'test';
    process.env.HASH_ENV = 'testing';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';

    const app = await createAndInitApp();
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/testing-assets/items/non-existent-item/image',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        message: 'Testing image was not found for this item.',
      });
    } finally {
      await app.close();
    }
  });

  it('hard-blocks testing-assets routes in production runtime', async () => {
    process.env.NODE_ENV = 'production';
    process.env.HASH_ENV = 'production';
    process.env.HASH_PROD_API_URL = 'https://hash.prod.example/api';
    process.env.HASH_PROD_API_KEY = 'prod-secret';
    process.env.HASH_HCONNECT_ENABLED = 'false';
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';

    const app = await createAndInitApp();
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/testing-assets/items/itm-beef-001/image',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        message: 'Testing assets route is disabled in HASH_ENV=production.',
      });
    } finally {
      await app.close();
    }
  });
});

async function createAndInitApp(): Promise<NestFastifyApplication> {
  const app = await createApiApp();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
