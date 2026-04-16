import { HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';
import type { AuthAgentRepository, PasswordVerifier, ShiftTokenSigner } from './auth.types';

describe('AuthService', () => {
  const agentRepository: AuthAgentRepository = {
    findByPhoneOrEmail: vi.fn(),
    findById: vi.fn(),
  };

  const passwordVerifier: PasswordVerifier = {
    verify: vi.fn(),
  };

  const tokenSigner: ShiftTokenSigner = {
    sign: vi.fn(),
  };

  const service = new AuthService(agentRepository, passwordVerifier, tokenSigner, {
    jwtSecret: 'test',
    jwtIssuer: 'test-suite',
    shiftTokenTtlSeconds: 8 * 60 * 60,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns access token and normalized profile for valid credentials', async () => {
    vi.mocked(agentRepository.findByPhoneOrEmail).mockResolvedValue({
      id: 'agent-1',
      name: 'Mona Parker',
      phone: '+972500000000',
      email: 'mona@example.com',
      role: 'field_agent',
      passwordHash: 'argon-hash',
      isActive: true,
      updatedAt: new Date('2026-04-16T10:00:00.000Z'),
    });
    vi.mocked(passwordVerifier.verify).mockResolvedValue(true);
    vi.mocked(tokenSigner.sign).mockReturnValue('jwt-token');

    await expect(
      service.login({
        phoneOrEmail: 'mona@example.com',
        password: 'correct-horse-battery-staple',
      }),
    ).resolves.toEqual({
      accessToken: 'jwt-token',
      expiresIn: 28800,
      agentProfile: {
        id: 'agent-1',
        name: 'Mona Parker',
        phone: '+972500000000',
        email: 'mona@example.com',
        role: 'field_agent',
      },
    });

    expect(tokenSigner.sign).toHaveBeenCalledWith(
      {
        sub: 'agent-1',
        phone: '+972500000000',
        role: 'field_agent',
        type: 'agent_shift',
      },
      28800,
    );
  });

  it('rejects unknown account with stable auth error', async () => {
    vi.mocked(agentRepository.findByPhoneOrEmail).mockResolvedValue(null);

    await expect(
      service.login({
        phoneOrEmail: 'unknown@example.com',
        password: 'irrelevant',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
      response: {
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      },
    });
  });

  it('returns supervisor role in agent profile when supervisor signs in', async () => {
    vi.mocked(agentRepository.findByPhoneOrEmail).mockResolvedValue({
      id: 'agent-sup-1',
      name: 'Supervisor Salwa',
      phone: '+972501100099',
      email: 'supervisor.salwa@awawda.test',
      role: 'supervisor',
      passwordHash: 'argon-hash',
      isActive: true,
      updatedAt: new Date('2026-04-16T10:00:00.000Z'),
    });
    vi.mocked(passwordVerifier.verify).mockResolvedValue(true);
    vi.mocked(tokenSigner.sign).mockReturnValue('jwt-token-supervisor');

    await expect(
      service.login({
        phoneOrEmail: 'supervisor.salwa@awawda.test',
        password: 'Password123',
      }),
    ).resolves.toMatchObject({
      accessToken: 'jwt-token-supervisor',
      expiresIn: 28800,
      agentProfile: {
        id: 'agent-sup-1',
        role: 'supervisor',
      },
    });
  });

  it('rejects invalid password with stable auth error', async () => {
    vi.mocked(agentRepository.findByPhoneOrEmail).mockResolvedValue({
      id: 'agent-1',
      name: 'Mona Parker',
      phone: '+972500000000',
      email: 'mona@example.com',
      role: 'field_agent',
      passwordHash: 'argon-hash',
      isActive: true,
      updatedAt: new Date('2026-04-16T10:00:00.000Z'),
    });
    vi.mocked(passwordVerifier.verify).mockResolvedValue(false);

    await expect(
      service.login({
        phoneOrEmail: 'mona@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
      response: {
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      },
    });
  });

  it('rejects inactive agent with stable auth error', async () => {
    vi.mocked(agentRepository.findByPhoneOrEmail).mockResolvedValue({
      id: 'agent-1',
      name: 'Mona Parker',
      phone: '+972500000000',
      email: 'mona@example.com',
      role: 'field_agent',
      passwordHash: 'argon-hash',
      isActive: false,
      updatedAt: new Date('2026-04-16T10:00:00.000Z'),
    });

    await expect(
      service.login({
        phoneOrEmail: 'mona@example.com',
        password: 'any-password',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
      response: {
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      },
    });
  });
});
