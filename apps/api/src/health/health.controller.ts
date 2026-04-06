import { Controller, Get, Inject } from '@nestjs/common';

import { HealthService, type HealthResponse } from './health.service';

@Controller({
  path: 'health',
  version: '1',
})
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  getHealth(): HealthResponse {
    return this.healthService.getStatus();
  }
}
