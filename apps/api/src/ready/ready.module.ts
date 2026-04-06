import { Module } from '@nestjs/common';

import { ReadyController } from './ready.controller';
import { ReadyService } from './ready.service';

@Module({
  controllers: [ReadyController],
  providers: [ReadyService],
})
export class ReadyModule {}
