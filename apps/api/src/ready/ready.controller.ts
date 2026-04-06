import { Controller, Get, Inject } from '@nestjs/common';

import { ReadyService, type ReadyResponse } from './ready.service';

@Controller({
  path: 'ready',
  version: '1',
})
export class ReadyController {
  constructor(@Inject(ReadyService) private readonly readyService: ReadyService) {}

  @Get()
  async getReady(): Promise<ReadyResponse> {
    return this.readyService.getStatus();
  }
}
