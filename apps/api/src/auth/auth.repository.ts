import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import type { AuthAgentRecord, AuthAgentRepository } from './auth.types';

@Injectable()
export class PrismaAuthAgentRepository implements AuthAgentRepository {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  async findByPhoneOrEmail(phoneOrEmail: string): Promise<AuthAgentRecord | null> {
    const normalized = phoneOrEmail.trim();
    const normalizedEmail = normalized.toLowerCase();

    const agent = await this.prisma.agent.findFirst({
      where: {
        OR: [{ phone: normalized }, { email: normalizedEmail }],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        passwordHash: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return toAuthAgentRecord(agent);
  }

  async findById(agentId: string): Promise<AuthAgentRecord | null> {
    const normalizedAgentId = agentId.trim();
    if (!normalizedAgentId) {
      return null;
    }

    const agent = await this.prisma.agent.findFirst({
      where: {
        id: normalizedAgentId,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        passwordHash: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return toAuthAgentRecord(agent);
  }
}

function toAuthAgentRecord(
  agent:
    | {
        id: string;
        name: string;
        phone: string;
        email: string | null;
        role: 'FIELD_AGENT' | 'SUPERVISOR';
        passwordHash: string;
        isActive: boolean;
        updatedAt: Date;
      }
    | null,
): AuthAgentRecord | null {
  if (!agent) {
    return null;
  }

  return {
    id: agent.id,
    name: agent.name,
    phone: agent.phone,
    email: agent.email,
    role: agent.role === 'SUPERVISOR' ? 'supervisor' : 'field_agent',
    passwordHash: agent.passwordHash,
    isActive: agent.isActive,
    updatedAt: agent.updatedAt,
  };
}
