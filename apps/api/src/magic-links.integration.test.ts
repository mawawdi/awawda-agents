import { createHash } from 'crypto';

import jwt from 'jsonwebtoken';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiApp } from './server';
import { MAGIC_LINKS_REPOSITORY, MAGIC_LINK_TOKEN_GENERATOR } from './links/links.constants';
import type { MagicLinkTokenGenerator, MagicLinksRepository } from './links/links.types';

describe('Magic link issuance endpoint', () => {
  let app: NestFastifyApplication;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalJwtIssuer = process.env.JWT_ISSUER;
  const originalMagicLinkBaseUrl = process.env.MAGIC_LINK_BASE_URL;
  const originalMagicLinkTtlSeconds = process.env.MAGIC_LINK_TTL_SECONDS;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'integration-test-secret';
    process.env.JWT_ISSUER = 'integration-suite';
    process.env.MAGIC_LINK_BASE_URL = 'https://portal.example.com/activate';
    process.env.MAGIC_LINK_TTL_SECONDS = '3600';

    app = await createApiApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();

    restoreEnv('JWT_SECRET', originalJwtSecret);
    restoreEnv('JWT_ISSUER', originalJwtIssuer);
    restoreEnv('MAGIC_LINK_BASE_URL', originalMagicLinkBaseUrl);
    restoreEnv('MAGIC_LINK_TTL_SECONDS', originalMagicLinkTtlSeconds);
  });

  it('rejects magic-link issuance without agent token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent/customers/cust-101/magic-links',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: 'AUTH_AGENT_TOKEN_REQUIRED',
      message: 'Agent access token is required',
    });
  });

  it('issues a link for the authenticated agent/customer mapping with hash-only persistence input', async () => {
    const repository = app.get<MagicLinksRepository>(MAGIC_LINKS_REPOSITORY);
    const tokenGenerator = app.get<MagicLinkTokenGenerator>(MAGIC_LINK_TOKEN_GENERATOR);

    vi.spyOn(tokenGenerator, 'generate').mockReturnValue('plain-token-material');
    vi.spyOn(repository, 'issueForAssignedCustomer').mockImplementation(async (input) => ({
      id: 'ml-1',
      tokenHash: input.tokenHash,
      hashCustomerId: input.customerId,
      issuedByAgentId: input.agentId,
      expiresAt: input.expiresAt,
      status: 'ISSUED',
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent/customers/cust-777/magic-links',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-42')}`,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      linkUrl: 'https://portal.example.com/activate?token=plain-token-material',
      expiresInSeconds: 3600,
      lifecycle: 'issued',
    });

    const issueCall = vi.mocked(repository.issueForAssignedCustomer).mock.calls[0]?.[0];
    expect(issueCall).toMatchObject({
      agentId: 'agent-42',
      customerId: 'cust-777',
      tokenHash: createHash('sha256').update('plain-token-material').digest('hex'),
    });
    expect(issueCall?.expiresAt).toBeInstanceOf(Date);
    expect(Object.keys(issueCall ?? {})).not.toContain('token');
  });

  it('enforces agent/customer authorization boundaries', async () => {
    const repository = app.get<MagicLinksRepository>(MAGIC_LINKS_REPOSITORY);

    vi.spyOn(repository, 'issueForAssignedCustomer').mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent/customers/cust-unassigned/magic-links',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-42')}`,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: 'LINKS_CUSTOMER_NOT_ASSIGNED',
      message: 'Agent is not assigned to the requested customer',
    });
  });
});

function signAgentToken(agentId: string): string {
  return jwt.sign(
    {
      sub: agentId,
      type: 'agent_shift',
    },
    process.env.JWT_SECRET!,
    {
      algorithm: 'HS256',
      issuer: process.env.JWT_ISSUER,
      expiresIn: '15m',
    },
  );
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
