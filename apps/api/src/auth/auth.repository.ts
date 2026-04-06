import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import type { AuthAgentRecord, AuthAgentRepository } from './auth.types';

@Injectable()
export class PrismaAuthAgentRepository implements AuthAgentRepository {
  constructor(private readonly prisma: PrismaClient) {}

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
        passwordHash: true,
        isActive: true,
      },
    });

    if (!agent) {
      return null;
    }

    return {
      id: agent.id,
      name: agent.name,
      phone: agent.phone,
      email: agent.email,
      passwordHash: agent.passwordHash,
      isActive: agent.isActive,
    };
  }
}
