import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import type { AuthAgentRecord, AuthAgentRepository, RefreshTokenRepository } from './auth.types';

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

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  async createRefreshToken(agentId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.refreshToken.create({
      data: { agentId, tokenHash, expiresAt },
    });
  }

  async rotateRefreshToken(
    tokenHash: string,
    newTokenHash: string,
    newExpiresAt: Date,
  ): Promise<{ agentId: string; tokenCreatedAt: Date } | null> {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      if (updated.count === 0) {
        return null;
      }
      const existing = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!existing) {
        return null;
      }
      await tx.refreshToken.create({
        data: { agentId: existing.agentId, tokenHash: newTokenHash, expiresAt: newExpiresAt },
      });
      return { agentId: existing.agentId, tokenCreatedAt: existing.createdAt };
    });
    return result;
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
