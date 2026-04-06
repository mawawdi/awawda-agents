import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';

import { AUTH_CONFIG } from './auth.constants';
import { AgentTokenInvalidError, AgentTokenMissingError } from './auth.errors';
import type { AuthConfig } from './auth.types';

type AgentRequest = {
  headers: {
    authorization?: string | string[];
    'x-agent-id'?: string;
  };
};

@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(@Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AgentRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new AgentTokenMissingError();
    }

    let payload: unknown;

    try {
      payload = jwt.verify(token, this.authConfig.jwtSecret, {
        algorithms: ['HS256'],
        issuer: this.authConfig.jwtIssuer,
      });
    } catch {
      throw new AgentTokenInvalidError();
    }

    if (!isAgentShiftPayload(payload)) {
      throw new AgentTokenInvalidError();
    }

    request.headers['x-agent-id'] = payload.sub;

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

function isAgentShiftPayload(payload: unknown): payload is { sub: string; phone?: string; type: 'agent_shift' } {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const subject = (payload as { sub?: unknown }).sub;
  const tokenType = (payload as { type?: unknown }).type;

  return typeof subject === 'string' && tokenType === 'agent_shift';
}
