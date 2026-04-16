import { HttpStatus, type ExecutionContext } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentAuthGuard } from './agent-auth.guard';
import type { AuthAgentRepository, AuthConfig } from './auth.types';

type GuardRequest = {
  headers: {
    authorization?: string;
    'x-agent-id'?: string;
    'x-agent-role'?: 'field_agent' | 'supervisor';
  };
};

describe('AgentAuthGuard', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const config: AuthConfig = {
    jwtSecret: 'test-secret',
    jwtIssuer: 'awawda-test',
    shiftTokenTtlSeconds: 3600,
  };

  const repository: AuthAgentRepository = {
    findByPhoneOrEmail: vi.fn(),
    findById: vi.fn(),
  };

  const guard = new AgentAuthGuard(config, repository);

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
      return;
    }
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('accepts valid token for active agent and injects role headers from DB', async () => {
    vi.mocked(repository.findById).mockResolvedValue({
      id: 'agent-1',
      name: 'Agent One',
      phone: '+972500000001',
      email: null,
      role: 'supervisor',
      passwordHash: 'hash',
      isActive: true,
      updatedAt: new Date('2026-04-16T10:00:00.000Z'),
    });

    const token = jwt.sign(
      {
        sub: 'agent-1',
        role: 'field_agent',
        type: 'agent_shift',
      },
      config.jwtSecret,
      { algorithm: 'HS256', issuer: config.jwtIssuer },
    );
    const request: GuardRequest = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.headers['x-agent-id']).toBe('agent-1');
    expect(request.headers['x-agent-role']).toBe('supervisor');
  });

  it('rejects token when agent is inactive', async () => {
    vi.mocked(repository.findById).mockResolvedValue({
      id: 'agent-1',
      name: 'Agent One',
      phone: '+972500000001',
      email: null,
      role: 'field_agent',
      passwordHash: 'hash',
      isActive: false,
      updatedAt: new Date('2026-04-16T10:00:00.000Z'),
    });

    const token = jwt.sign(
      {
        sub: 'agent-1',
        role: 'field_agent',
        type: 'agent_shift',
      },
      config.jwtSecret,
      { algorithm: 'HS256', issuer: config.jwtIssuer },
    );
    const request: GuardRequest = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
      response: {
        code: 'AUTH_AGENT_ACCESS_REVOKED',
      },
    });
  });

  it('rejects token issued before supervisor-forced logout timestamp', async () => {
    vi.mocked(repository.findById).mockResolvedValue({
      id: 'agent-1',
      name: 'Agent One',
      phone: '+972500000001',
      email: null,
      role: 'field_agent',
      passwordHash: 'hash',
      isActive: true,
      updatedAt: new Date(Date.now() + 60_000),
    });

    const token = jwt.sign(
      {
        sub: 'agent-1',
        role: 'field_agent',
        type: 'agent_shift',
      },
      config.jwtSecret,
      { algorithm: 'HS256', issuer: config.jwtIssuer },
    );
    const request: GuardRequest = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
      response: {
        code: 'AUTH_AGENT_ACCESS_REVOKED',
      },
    });
  });

  it('rejects malformed auth header', async () => {
    const request: GuardRequest = {
      headers: {
        authorization: 'invalid-token',
      },
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
      response: {
        code: 'AUTH_AGENT_TOKEN_REQUIRED',
      },
    });
  });
});
