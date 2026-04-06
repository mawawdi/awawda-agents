import { HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';
import type { AuthAgentRepository, PasswordVerifier, ShiftTokenSigner } from './auth.types';

describe('AuthService', () => {
  const agentRepository: AuthAgentRepository = {
    findByPhoneOrEmail: vi.fn(),
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
      passwordHash: 'argon-hash',
      isActive: true,
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
      },
    });

    expect(tokenSigner.sign).toHaveBeenCalledWith(
      {
        sub: 'agent-1',
        phone: '+972500000000',
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

  it('rejects invalid password with stable auth error', async () => {
    vi.mocked(agentRepository.findByPhoneOrEmail).mockResolvedValue({
      id: 'agent-1',
      name: 'Mona Parker',
      phone: '+972500000000',
      email: 'mona@example.com',
      passwordHash: 'argon-hash',
      isActive: true,
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
      passwordHash: 'argon-hash',
      isActive: false,
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
