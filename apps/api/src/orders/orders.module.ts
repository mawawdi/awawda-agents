import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { AuthModule } from '../auth/auth.module';
import { ErpModule } from '../erp/erp.module';
import { CustomerSessionAuthGuard } from '../sessions/customer-session-auth.guard';
import { SessionsModule } from '../sessions/sessions.module';
import { ORDERS_REPOSITORY } from './orders.constants';
import { OrdersController } from './orders.controller';
import { PrismaOrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, ErpModule, SessionsModule],
  controllers: [OrdersController],
  providers: [
    PrismaClient,
    CustomerSessionAuthGuard,
    OrdersService,
    PrismaOrdersRepository,
    {
      provide: ORDERS_REPOSITORY,
      useExisting: PrismaOrdersRepository,
    },
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
