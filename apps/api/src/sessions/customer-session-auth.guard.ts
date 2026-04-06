import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';

import { AUTH_CONFIG } from '../auth/auth.constants';
import type { AuthConfig } from '../auth/auth.types';
import { CUSTOMER_SESSIONS_REPOSITORY } from './sessions.constants';
import { CustomerSessionExpiredError, CustomerSessionTokenInvalidError, CustomerSessionTokenMissingError } from './sessions.errors';
import type { CustomerSessionsRepository } from './sessions.types';

type CustomerRequest = {
  headers: {
    authorization?: string | string[];
    'x-customer-id'?: string;
    'x-customer-session-id'?: string;
    'x-customer-session-expires-at'?: string;
  };
};

@Injectable()
export class CustomerSessionAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig,
    @Inject(CUSTOMER_SESSIONS_REPOSITORY)
    private readonly customerSessionsRepository: CustomerSessionsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomerRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new CustomerSessionTokenMissingError();
    }

    let payload: unknown;

    try {
      payload = jwt.verify(token, this.authConfig.jwtSecret, {
        algorithms: ['HS256'],
        issuer: this.authConfig.jwtIssuer,
      });
    } catch {
      throw new CustomerSessionTokenInvalidError();
    }

    if (!isCustomerSessionPayload(payload)) {
      throw new CustomerSessionTokenInvalidError();
    }

    const validationResult = await this.customerSessionsRepository.validateCustomerSession(
      payload.sub,
      payload.customerId,
      new Date(),
    );

    if (validationResult.kind === 'expired') {
      throw new CustomerSessionExpiredError();
    }

    if (validationResult.kind === 'invalid') {
      throw new CustomerSessionTokenInvalidError();
    }

    request.headers['x-customer-id'] = validationResult.customerId;
    request.headers['x-customer-session-id'] = validationResult.sessionId;
    request.headers['x-customer-session-expires-at'] = validationResult.sessionExpiresAt.toISOString();

    return true;
  }
}

function extractBearerToken(headerValue: string | string[] | undefined): string | null {
  if (!headerValue || Array.isArray(headerValue)) {
    return null;
  }

  const [scheme, token] = headerValue.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

function isCustomerSessionPayload(
  payload: unknown,
): payload is { sub: string; customerId: string; type: 'customer_session' } {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const subject = (payload as { sub?: unknown }).sub;
  const customerId = (payload as { customerId?: unknown }).customerId;
  const tokenType = (payload as { type?: unknown }).type;

  return typeof subject === 'string' && typeof customerId === 'string' && tokenType === 'customer_session';
}
