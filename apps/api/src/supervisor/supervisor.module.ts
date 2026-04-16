import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { AuthModule } from '../auth/auth.module';
import { SUPERVISOR_REPOSITORY } from './supervisor.constants';
import { SupervisorController } from './supervisor.controller';
import { PrismaSupervisorRepository } from './supervisor.repository';
import { SupervisorService } from './supervisor.service';

@Module({
  imports: [AuthModule],
  controllers: [SupervisorController],
  providers: [
    PrismaClient,
    SupervisorService,
    PrismaSupervisorRepository,
    {
      provide: SUPERVISOR_REPOSITORY,
      useExisting: PrismaSupervisorRepository,
    },
  ],
  exports: [SupervisorService],
})
export class SupervisorModule {}
