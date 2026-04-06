import { Inject, Injectable } from '@nestjs/common';
import type { AgentLoginRequest, AgentLoginResponse } from '@meatland/shared-types';

import {
  AUTH_AGENT_REPOSITORY,
  AUTH_CONFIG,
  AUTH_PASSWORD_VERIFIER,
  AUTH_SHIFT_TOKEN_SIGNER,
} from './auth.constants';
import { InvalidCredentialsError } from './auth.errors';
import type { AuthAgentRepository, AuthConfig, PasswordVerifier, ShiftTokenSigner } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_AGENT_REPOSITORY) private readonly agentRepository: AuthAgentRepository,
    @Inject(AUTH_PASSWORD_VERIFIER) private readonly passwordVerifier: PasswordVerifier,
    @Inject(AUTH_SHIFT_TOKEN_SIGNER) private readonly tokenSigner: ShiftTokenSigner,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
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
        type: 'agent_shift',
      },
      expiresIn,
    );

    return {
      accessToken,
      expiresIn,
      agentProfile: {
        id: agent.id,
        name: agent.name,
        phone: agent.phone,
        email: agent.email,
      },
    };
  }
}
