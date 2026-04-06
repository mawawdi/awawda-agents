import { Module } from '@nestjs/common';

import { ErpModule } from '../erp/erp.module';
import { OrdersService } from './orders.service';

@Module({
  imports: [ErpModule],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
