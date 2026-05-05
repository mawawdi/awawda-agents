import { ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { CustomerPortalDataResponse, CustomerSessionActivateResponse } from '@awawda/shared-types';

import { CustomerSessionAuthGuard } from './customer-session-auth.guard';
import { CustomerSessionActivationDto } from './dto/customer-session-activation.dto';
import { SessionsService } from './sessions.service';

@ApiTags('customer/sessions')
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

export function resolveClientIp(request: {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}): string {
  const directIp = normalizeIpValue(request.ip);
  if (directIp === null) {
    return readForwardedIp(request.headers) ?? readHeaderIp(request.headers['x-real-ip']) ?? 'unknown';
  }

  if (isTrustedProxyIp(directIp)) {
    return readForwardedIp(request.headers) ?? readHeaderIp(request.headers['x-real-ip']) ?? directIp;
  }

  return directIp;
}

function readForwardedIp(headers: Record<string, string | string[] | undefined>): string | null {
  const forwardedForValue = readHeaderIp(headers['x-forwarded-for']);
  if (!forwardedForValue) {
    return null;
  }

  const [firstIp] = forwardedForValue.split(',');
  return normalizeIpValue(firstIp);
}

function readHeaderIp(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return normalizeIpValue(candidate);
}

function normalizeIpValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function isTrustedProxyIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  const unmapped = normalized.startsWith('::ffff:') ? normalized.slice('::ffff:'.length) : normalized;

  if (unmapped === '::1' || unmapped === '127.0.0.1') {
    return true;
  }

  if (isTrustedProxyIpv4(unmapped)) {
    return true;
  }

  return unmapped.startsWith('fc') || unmapped.startsWith('fd') || unmapped.startsWith('fe80:');
}

function isTrustedProxyIpv4(ip: string): boolean {
  const segments = ip.split('.').map((segment) => Number.parseInt(segment, 10));
  if (segments.length !== 4 || segments.some((segment) => Number.isNaN(segment) || segment < 0 || segment > 255)) {
    return false;
  }

  const [first, second] = segments;
  return (
    first === 10 ||
    first === 127 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 169 && second === 254)
  );
}
