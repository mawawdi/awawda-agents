import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { AuthModule } from '../auth/auth.module';
import { ErpModule } from '../erp/erp.module';
import { CustomerSessionAuthGuard } from '../sessions/customer-session-auth.guard';
import { SessionsModule } from '../sessions/sessions.module';
import { AGENT_ORDERS_REPOSITORY, ORDERS_REPOSITORY } from './orders.constants';
import { AgentOrdersController } from './agent-orders.controller';
import { AgentOrdersService } from './agent-orders.service';
import { OrdersController } from './orders.controller';
import { PrismaOrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, ErpModule, SessionsModule],
  controllers: [OrdersController, AgentOrdersController],
  providers: [
    PrismaClient,
    CustomerSessionAuthGuard,
    OrdersService,
    AgentOrdersService,
    PrismaOrdersRepository,
    {
      provide: ORDERS_REPOSITORY,
      useExisting: PrismaOrdersRepository,
    },
    {
      provide: AGENT_ORDERS_REPOSITORY,
      useExisting: PrismaOrdersRepository,
    },
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
