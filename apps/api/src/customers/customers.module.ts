import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { AuthModule } from '../auth/auth.module';
import { AGENT_CUSTOMERS_REPOSITORY } from './customers.constants';
import { CustomersController } from './customers.controller';
import { PrismaAgentCustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';

@Module({
  imports: [AuthModule],
  controllers: [CustomersController],
  providers: [
    PrismaClient,
    CustomersService,
    PrismaAgentCustomersRepository,
    {
      provide: AGENT_CUSTOMERS_REPOSITORY,
      useExisting: PrismaAgentCustomersRepository,
    },
  ],
  exports: [CustomersService],
})
export class CustomersModule {}
