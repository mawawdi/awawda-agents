import { Controller, Get, Inject, Res } from '@nestjs/common';

import { ReadyService, type ReadyResponse } from './ready.service';

@Controller({
  path: 'ready',
  version: '1',
})
export class ReadyController {
  constructor(@Inject(ReadyService) private readonly readyService: ReadyService) {}

  @Get()
  async getReady(@Res({ passthrough: true }) response: { status(code: number): unknown }): Promise<ReadyResponse> {
    const ready = await this.readyService.getStatus();
    response.status(ready.status === 'ready' ? 200 : 503);
    return ready;
  }
}
