import { Body, Controller, Get, Headers, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import type { CustomerPortalDataResponse, CustomerSessionActivateResponse } from '@meatland/shared-types';

import { CustomerSessionAuthGuard } from './customer-session-auth.guard';
import { CustomerSessionActivationDto } from './dto/customer-session-activation.dto';
import { SessionsService } from './sessions.service';

@Controller({ path: 'customer', version: '1' })
export class SessionsController {
  constructor(@Inject(SessionsService) private readonly sessionsService: SessionsService) {}

  @Post('sessions/activate')
  @HttpCode(200)
  activateSession(
    @Body() activationRequest: CustomerSessionActivationDto,
  ): Promise<CustomerSessionActivateResponse> {
    return this.sessionsService.activateSession(activationRequest.token);
  }

  @Get('portal-data')
  @UseGuards(CustomerSessionAuthGuard)
  getPortalData(
    @Headers('x-customer-id') customerId: string,
    @Headers('x-customer-session-expires-at') customerSessionExpiresAt: string,
  ): Promise<CustomerPortalDataResponse> {
    return this.sessionsService.getPortalData(customerId, customerSessionExpiresAt);
  }
}
