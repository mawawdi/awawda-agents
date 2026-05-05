import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AgentLoginResponse, AgentRefreshResponse } from '@awawda/shared-types';

import type { AgentLoginRequest } from '@awawda/shared-types';

import {
  AUTH_AGENT_REPOSITORY,
  AUTH_CONFIG,
  AUTH_PASSWORD_VERIFIER,
  AUTH_REFRESH_TOKEN_REPOSITORY,
  AUTH_SHIFT_TOKEN_SIGNER,
} from './auth.constants';
import { InvalidCredentialsError } from './auth.errors';
import type { AuthAgentRepository, AuthConfig, PasswordVerifier, RefreshTokenRepository, ShiftTokenSigner } from './auth.types';

const REFRESH_TOKEN_TTL_SECONDS_DEFAULT = 30 * 24 * 60 * 60; // 30 days

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_AGENT_REPOSITORY) private readonly agentRepository: AuthAgentRepository,
    @Inject(AUTH_PASSWORD_VERIFIER) private readonly passwordVerifier: PasswordVerifier,
    @Inject(AUTH_SHIFT_TOKEN_SIGNER) private readonly tokenSigner: ShiftTokenSigner,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(AUTH_REFRESH_TOKEN_REPOSITORY) private readonly refreshTokenRepo: RefreshTokenRepository,
  ) {}

  async login(credentials: AgentLoginRequest): Promise<AgentLoginResponse> {
    const phoneOrEmail = credentials.phoneOrEmail.trim();
    const password = credentials.password;

    const agent = await this.agentRepository.findByPhoneOrEmail(phoneOrEmail);

    if (!agent || !agent.isActive) {
      throw new InvalidCredentialsError();
    }

    const isPasswordValid = await this.passwordVerifier.verify(password, agent.passwordHash);

    if (!isPasswordValid) {
      throw new InvalidCredentialsError();
    }

    const expiresIn = this.config.shiftTokenTtlSeconds;

    const accessToken = this.tokenSigner.sign(
      {
        sub: agent.id,
        phone: agent.phone,
        role: agent.role,
        type: 'agent_shift',
      },
      expiresIn,
    );

    const { rawToken, tokenHash, expiresAt, refreshTokenExpiresIn } = this.generateRefreshToken();
    await this.refreshTokenRepo.createRefreshToken(agent.id, tokenHash, expiresAt);

    return {
      accessToken,
      expiresIn,
      refreshToken: rawToken,
      refreshTokenExpiresIn,
      agentProfile: {
        id: agent.id,
        name: agent.name,
        phone: agent.phone,
        email: agent.email,
        role: agent.role,
      },
    };
  }

  async refresh(rawRefreshToken: string): Promise<AgentRefreshResponse> {
    const inputHash = createHash('sha256').update(rawRefreshToken).digest('hex');
    const { rawToken: newRaw, tokenHash: newHash, expiresAt: newExpiry, refreshTokenExpiresIn } = this.generateRefreshToken();

    const result = await this.refreshTokenRepo.rotateRefreshToken(inputHash, newHash, newExpiry);

    if (!result) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const agent = await this.agentRepository.findById(result.agentId);

    if (!agent || !agent.isActive) {
      throw new UnauthorizedException('Agent not active');
    }

    // Reject if a force-logout happened after this token was issued
    if (agent.updatedAt > result.tokenCreatedAt) {
      throw new UnauthorizedException('Session invalidated');
    }

    const expiresIn = this.config.shiftTokenTtlSeconds;
    const accessToken = this.tokenSigner.sign(
      {
        sub: agent.id,
        phone: agent.phone,
        role: agent.role,
        type: 'agent_shift',
      },
      expiresIn,
    );

    return { accessToken, expiresIn, refreshToken: newRaw, refreshTokenExpiresIn };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    if (!rawRefreshToken?.trim()) {
      return;
    }
    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
    await this.refreshTokenRepo.revokeRefreshToken(tokenHash);
  }

  private generateRefreshToken(): {
    rawToken: string;
    tokenHash: string;
    expiresAt: Date;
    refreshTokenExpiresIn: number;
  } {
    const refreshTokenExpiresIn = this.config.refreshTokenTtlSeconds ?? REFRESH_TOKEN_TTL_SECONDS_DEFAULT;
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + refreshTokenExpiresIn * 1000);
    return { rawToken, tokenHash, expiresAt, refreshTokenExpiresIn };
  }
}
