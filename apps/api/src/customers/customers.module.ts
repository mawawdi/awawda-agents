import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { AuthModule } from '../auth/auth.module';
import { ErpModule } from '../erp/erp.module';
import { AGENT_CUSTOMERS_REPOSITORY } from './customers.constants';
import { CustomerReportsController } from './customer-reports.controller';
import { CustomerReportsService } from './customer-reports.service';
import { CustomersController } from './customers.controller';
import { PrismaAgentCustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';

@Module({
  imports: [AuthModule, ErpModule],
  controllers: [CustomersController, CustomerReportsController],
  providers: [
    PrismaClient,
    CustomersService,
    CustomerReportsService,
    PrismaAgentCustomersRepository,
    {
      provide: AGENT_CUSTOMERS_REPOSITORY,
      useExisting: PrismaAgentCustomersRepository,
    },
  ],
  exports: [CustomersService],
})
export class CustomersModule {}
