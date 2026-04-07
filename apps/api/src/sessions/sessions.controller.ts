import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
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
    @Req()
    request: {
      ip?: string;
      headers: Record<string, string | string[] | undefined>;
    },
  ): Promise<CustomerSessionActivateResponse> {
    return this.sessionsService.activateSession(
      activationRequest.token,
      resolveClientIp(request),
    );
  }

  @Get('portal-data')
  @UseGuards(CustomerSessionAuthGuard)
  getPortalData(
    @Headers('x-customer-id') customerId: string,
    @Headers('x-customer-session-expires-at') customerSessionExpiresAt: string,
  ): Promise<CustomerPortalDataResponse> {
    return this.sessionsService.getPortalData(customerId, customerSessionExpiresAt);
  }

  @Post('session/logout')
  @HttpCode(204)
  @UseGuards(CustomerSessionAuthGuard)
  async logoutSession(
    @Headers('x-customer-id') customerId: string,
    @Headers('x-customer-session-id') customerSessionId: string,
  ): Promise<void> {
    await this.sessionsService.logoutSession(customerSessionId, customerId);
  }
}

function resolveClientIp(request: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  const forwardedForHeader = request.headers['x-forwarded-for'];
  const forwardedForValue = Array.isArray(forwardedForHeader) ? forwardedForHeader[0] : forwardedForHeader;
  if (forwardedForValue) {
    const [firstIp] = forwardedForValue.split(',');
    if (firstIp && firstIp.trim().length > 0) {
      return firstIp.trim();
    }
  }

  const realIpHeader = request.headers['x-real-ip'];
  const realIpValue = Array.isArray(realIpHeader) ? realIpHeader[0] : realIpHeader;
  if (realIpValue && realIpValue.trim().length > 0) {
    return realIpValue.trim();
  }

  return request.ip ?? 'unknown';
}
