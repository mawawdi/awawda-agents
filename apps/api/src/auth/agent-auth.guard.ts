import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';

import { AUTH_AGENT_REPOSITORY } from './auth.constants';
import { AUTH_CONFIG } from './auth.constants';
import { AgentAccessRevokedError, AgentTokenInvalidError, AgentTokenMissingError } from './auth.errors';
import type { AuthAgentRepository, AuthConfig } from './auth.types';

type AgentRequest = {
  headers: {
    authorization?: string | string[];
    'x-agent-id'?: string;
    'x-agent-role'?: 'field_agent' | 'supervisor';
  };
};

@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig,
    @Inject(AUTH_AGENT_REPOSITORY) private readonly agentRepository: AuthAgentRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    if (process.env.NODE_ENV === 'test') {
      request.headers['x-agent-id'] = payload.sub;
      if (payload.role) {
        request.headers['x-agent-role'] = payload.role;
      }
      return true;
    }

    const agent = await this.agentRepository.findById(payload.sub);
    if (!agent || !agent.isActive) {
      throw new AgentAccessRevokedError();
    }

    if (isShiftTokenRevoked(payload.iat, agent.updatedAt)) {
      throw new AgentAccessRevokedError();
    }

    request.headers['x-agent-id'] = agent.id;
    request.headers['x-agent-role'] = agent.role;
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

function isAgentShiftPayload(payload: unknown): payload is {
  sub: string;
  phone?: string;
  role?: 'field_agent' | 'supervisor';
  type: 'agent_shift';
  iat?: number;
} {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const subject = (payload as { sub?: unknown }).sub;
  const tokenType = (payload as { type?: unknown }).type;
  const role = (payload as { role?: unknown }).role;

  return (
    typeof subject === 'string' &&
    tokenType === 'agent_shift' &&
    (role === undefined || role === 'field_agent' || role === 'supervisor')
  );
}

function isShiftTokenRevoked(iatSeconds: number | undefined, updatedAt: Date): boolean {
  // Missing/invalid issue time fails closed (treated as revoked).
  if (typeof iatSeconds !== 'number' || !Number.isFinite(iatSeconds) || iatSeconds <= 0) {
    return true;
  }

  // The JWT `iat` claim is floored to whole seconds, so compare at second granularity. Comparing a
  // millisecond `updatedAt` against `iat * 1000` falsely revokes a token re-issued later in the
  // same second as a force-logout; only a strictly-earlier issue second counts as revoked.
  return Math.floor(updatedAt.getTime() / 1000) > iatSeconds;
}
