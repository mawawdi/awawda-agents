import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { AuthModule } from '../auth/auth.module';
import { ErpModule } from '../erp/erp.module';
import { ActivationRateLimiter } from './activation-rate-limiter';
import { CustomerSessionAuthGuard } from './customer-session-auth.guard';
import { JwtCustomerSessionTokenSigner } from './customer-session-token-signer';
import { loadSessionsConfig } from './sessions.config';
import { CUSTOMER_SESSIONS_REPOSITORY, CUSTOMER_SESSION_TOKEN_SIGNER, SESSIONS_CONFIG } from './sessions.constants';
import { SessionsController } from './sessions.controller';
import { PrismaCustomerSessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

@Module({
  imports: [AuthModule, ErpModule],
  controllers: [SessionsController],
  providers: [
    PrismaClient,
    SessionsService,
    ActivationRateLimiter,
    PrismaCustomerSessionsRepository,
    JwtCustomerSessionTokenSigner,
    CustomerSessionAuthGuard,
    {
      provide: SESSIONS_CONFIG,
      useFactory: loadSessionsConfig,
    },
    {
      provide: CUSTOMER_SESSIONS_REPOSITORY,
      useExisting: PrismaCustomerSessionsRepository,
    },
    {
      provide: CUSTOMER_SESSION_TOKEN_SIGNER,
      useExisting: JwtCustomerSessionTokenSigner,
    },
  ],
  exports: [CustomerSessionAuthGuard, CUSTOMER_SESSIONS_REPOSITORY],
})
export class SessionsModule {}
