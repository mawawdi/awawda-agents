import { Injectable } from '@nestjs/common';
import { MagicLinkStatus, PrismaClient } from '@prisma/client';

import type { IssueMagicLinkInput, IssuedMagicLinkRecord, MagicLinksRepository } from './links.types';

@Injectable()
export class PrismaMagicLinksRepository implements MagicLinksRepository {
  constructor(private readonly prisma: PrismaClient) {}

  issueForAssignedCustomer(input: IssueMagicLinkInput): Promise<IssuedMagicLinkRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findUnique({
        where: {
          agentId_hashCustomerId: {
            agentId: input.agentId,
            hashCustomerId: input.customerId,
          },
        },
        select: {
          hashCustomerId: true,
        },
      });

      if (!assignment) {
        return null;
      }

      return tx.magicLink.create({
        data: {
          tokenHash: input.tokenHash,
          hashCustomerId: assignment.hashCustomerId,
          issuedByAgentId: input.agentId,
          expiresAt: input.expiresAt,
          status: MagicLinkStatus.ISSUED,
        },
        select: {
          id: true,
          tokenHash: true,
          hashCustomerId: true,
          issuedByAgentId: true,
          expiresAt: true,
          status: true,
        },
      });
    });
  }
}
