import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import { LoginAgentDto } from './dto/login-agent.dto';

type AgentProfile = {
  agentId: string;
  name: string;
  email: string;
};

export type LoginResponse = {
  accessToken: string;
  expiresIn: number;
  agentProfile: AgentProfile;
};

@Injectable()
export class AuthService {
  private readonly sessionTtlSeconds = 60 * 60 * 8;
  private readonly activeSessions = new Map<string, AgentProfile>();
  private readonly allowedAgent = {
    agentId: 'agent-001',
    name: process.env.AGENT_AUTH_NAME ?? 'Demo Agent',
    email: (process.env.AGENT_AUTH_EMAIL ?? 'agent@meatland.local').toLowerCase(),
    passwordHash: this.hashValue(process.env.AGENT_AUTH_PASSWORD ?? 'Password123!'),
  };

  login(input: LoginAgentDto): LoginResponse {
    const email = input.email.trim().toLowerCase();

    if (
      email !== this.allowedAgent.email ||
      this.hashValue(input.password) !== this.allowedAgent.passwordHash
    ) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const accessToken = randomUUID();
    const profile: AgentProfile = {
      agentId: this.allowedAgent.agentId,
      name: this.allowedAgent.name,
      email: this.allowedAgent.email,
    };
    this.activeSessions.set(accessToken, profile);

    return {
      accessToken,
      expiresIn: this.sessionTtlSeconds,
      agentProfile: profile,
    };
  }

  getSession(accessToken: string): AgentProfile {
    const session = this.activeSessions.get(accessToken);
    if (!session) {
      throw new UnauthorizedException('Session is not active.');
    }

    return session;
  }

  logout(accessToken: string): void {
    this.activeSessions.delete(accessToken);
  }

  private hashValue(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
