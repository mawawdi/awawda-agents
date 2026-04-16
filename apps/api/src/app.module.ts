import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CustomersModule } from './customers/customers.module';
import { ErpModule } from './erp/erp.module';
import { HealthModule } from './health/health.module';
import { LinksModule } from './links/links.module';
import { OrdersModule } from './orders/orders.module';
import { ReadyModule } from './ready/ready.module';
import { SessionsModule } from './sessions/sessions.module';
import { SupervisorModule } from './supervisor/supervisor.module';

@Module({
  imports: [
    HealthModule,
    ReadyModule,
    AuthModule,
    CustomersModule,
    CatalogModule,
    LinksModule,
    SessionsModule,
    OrdersModule,
    SupervisorModule,
    ErpModule,
  ],
})
export class AppModule {}
