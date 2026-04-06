import { Module } from '@nestjs/common';

import { ErpModule } from '../erp/erp.module';
import { ReadyController } from './ready.controller';
import { ReadyService } from './ready.service';

@Module({
  imports: [ErpModule],
  controllers: [ReadyController],
  providers: [ReadyService],
})
export class ReadyModule {}
