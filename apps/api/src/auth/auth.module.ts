import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { loadAuthConfig } from './auth.config';
import {
  AUTH_AGENT_REPOSITORY,
  AUTH_CONFIG,
  AUTH_PASSWORD_VERIFIER,
  AUTH_SHIFT_TOKEN_SIGNER,
} from './auth.constants';
import { AgentAuthGuard } from './agent-auth.guard';
import { AuthController } from './auth.controller';
import { PrismaAuthAgentRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { Argon2PasswordVerifier } from './password-verifier';
import { JwtShiftTokenSigner } from './shift-token-signer';

@Module({
  controllers: [AuthController],
  providers: [
    PrismaClient,
    AuthService,
    PrismaAuthAgentRepository,
    Argon2PasswordVerifier,
    JwtShiftTokenSigner,
    AgentAuthGuard,
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
  ],
  exports: [AgentAuthGuard, AUTH_CONFIG],
})
export class AuthModule {}
