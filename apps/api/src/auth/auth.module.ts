import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { loadAuthConfig } from './auth.config';
import {
  AUTH_AGENT_REPOSITORY,
  AUTH_CONFIG,
  AUTH_PASSWORD_VERIFIER,
  AUTH_REFRESH_TOKEN_REPOSITORY,
  AUTH_SHIFT_TOKEN_SIGNER,
} from './auth.constants';
import { AgentAuthGuard } from './agent-auth.guard';
import { AuthController } from './auth.controller';
import { PrismaAuthAgentRepository, PrismaRefreshTokenRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { Argon2PasswordVerifier } from './password-verifier';
import { JwtShiftTokenSigner } from './shift-token-signer';
import { SupervisorAuthGuard } from './supervisor-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [
    PrismaClient,
    AuthService,
    PrismaAuthAgentRepository,
    PrismaRefreshTokenRepository,
    Argon2PasswordVerifier,
    JwtShiftTokenSigner,
    AgentAuthGuard,
    SupervisorAuthGuard,
    {
      provide: AUTH_CONFIG,
      useFactory: loadAuthConfig,
    },
    {
      provide: AUTH_AGENT_REPOSITORY,
      useExisting: PrismaAuthAgentRepository,
    },
    {
      provide: AUTH_PASSWORD_VERIFIER,
      useExisting: Argon2PasswordVerifier,
    },
    {
      provide: AUTH_SHIFT_TOKEN_SIGNER,
      useExisting: JwtShiftTokenSigner,
    },
    {
      provide: AUTH_REFRESH_TOKEN_REPOSITORY,
      useExisting: PrismaRefreshTokenRepository,
    },
  ],
  exports: [AgentAuthGuard, SupervisorAuthGuard, AUTH_CONFIG, AUTH_AGENT_REPOSITORY],
})
export class AuthModule {}
