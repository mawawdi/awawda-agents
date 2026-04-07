import { Injectable } from '@nestjs/common';
import { AuditActorType, MagicLinkStatus, PrismaClient, SessionStatus } from '@prisma/client';
import type { CustomerApprovedItem } from '@meatland/shared-types';

import type {
  RecordActivationAttemptInput,
  CustomerSessionValidationResult,
  CustomerSessionsRepository,
  SessionActivationResult,
} from './sessions.types';

@Injectable()
export class PrismaCustomerSessionsRepository implements CustomerSessionsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async activateMagicToken(
    tokenHash: string,
    now: Date,
    sessionExpiresAt: Date,
  ): Promise<SessionActivationResult> {
    return this.prisma.$transaction(async (tx) => {
      const magicLink = await tx.magicLink.findUnique({
        where: {
          tokenHash,
        },
        select: {
          id: true,
          hashCustomerId: true,
          issuedByAgentId: true,
          status: true,
          expiresAt: true,
        },
      });

      if (!magicLink) {
        return { kind: 'invalid' };
      }

      if (magicLink.status === MagicLinkStatus.ISSUED && magicLink.expiresAt <= now) {
        await tx.magicLink.update({
          where: {
            id: magicLink.id,
          },
          data: {
            status: MagicLinkStatus.EXPIRED,
          },
        });

        await tx.auditLog.create({
          data: {
            actorType: AuditActorType.SYSTEM,
            actorId: magicLink.hashCustomerId,
            eventType: 'magic_link.expired',
            eventPayloadJson: {
              magicLinkId: magicLink.id,
              customerId: magicLink.hashCustomerId,
            },
          },
        });

        return { kind: 'expired' };
      }

      if (magicLink.status === MagicLinkStatus.EXPIRED) {
        return { kind: 'expired' };
      }

      if (magicLink.status !== MagicLinkStatus.ISSUED) {
        return { kind: 'invalid' };
      }

      await tx.magicLink.update({
        where: {
          id: magicLink.id,
        },
        data: {
          status: MagicLinkStatus.ACTIVATED,
          activatedAt: now,
        },
      });

      const session = await tx.session.create({
        data: {
          magicLinkId: magicLink.id,
          hashCustomerId: magicLink.hashCustomerId,
          sessionExpiresAt,
          status: SessionStatus.ACTIVE,
          isActive: true,
        },
        select: {
          id: true,
          hashCustomerId: true,
          sessionExpiresAt: true,
        },
      });

      await tx.auditLog.createMany({
        data: [
          {
            actorType: AuditActorType.SYSTEM,
            actorId: magicLink.hashCustomerId,
            eventType: 'magic_link.activated',
            eventPayloadJson: {
              magicLinkId: magicLink.id,
              customerId: magicLink.hashCustomerId,
              issuedByAgentId: magicLink.issuedByAgentId,
            },
          },
          {
            actorType: AuditActorType.SYSTEM,
            actorId: session.id,
            eventType: 'customer_session.activated',
            eventPayloadJson: {
              sessionId: session.id,
              customerId: session.hashCustomerId,
              magicLinkId: magicLink.id,
            },
          },
        ],
      });

      return {
        kind: 'activated',
        sessionId: session.id,
        customerId: session.hashCustomerId,
        sessionExpiresAt: session.sessionExpiresAt,
      };
    });
  }

  async validateCustomerSession(
    sessionId: string,
    customerId: string,
    now: Date,
  ): Promise<CustomerSessionValidationResult> {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: {
          id: sessionId,
        },
        select: {
          id: true,
          hashCustomerId: true,
          sessionExpiresAt: true,
          status: true,
          isActive: true,
        },
      });

      if (!session || session.hashCustomerId !== customerId) {
        return { kind: 'invalid' };
      }

      if (!session.isActive || session.status !== SessionStatus.ACTIVE) {
        return session.status === SessionStatus.EXPIRED ? { kind: 'expired' } : { kind: 'invalid' };
      }

      if (session.sessionExpiresAt <= now) {
        await tx.session.update({
          where: {
            id: session.id,
          },
          data: {
            status: SessionStatus.EXPIRED,
            isActive: false,
          },
        });

        await tx.auditLog.create({
          data: {
            actorType: AuditActorType.SYSTEM,
            actorId: session.id,
            eventType: 'customer_session.expired',
            eventPayloadJson: {
              sessionId: session.id,
              customerId: session.hashCustomerId,
            },
          },
        });

        return { kind: 'expired' };
      }

      return {
        kind: 'valid',
        sessionId: session.id,
        customerId: session.hashCustomerId,
        sessionExpiresAt: session.sessionExpiresAt,
      };
    });
  }

  async deactivateCustomerSession(sessionId: string, customerId: string, closedAt: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: {
          id: sessionId,
        },
        select: {
          id: true,
          hashCustomerId: true,
          status: true,
          isActive: true,
        },
      });

      if (!session || session.hashCustomerId !== customerId || !session.isActive || session.status !== SessionStatus.ACTIVE) {
        return;
      }

      await tx.session.update({
        where: {
          id: session.id,
        },
        data: {
          status: SessionStatus.CLOSED,
          isActive: false,
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.CUSTOMER_SESSION,
          actorId: session.id,
          eventType: 'customer_session.closed',
          eventPayloadJson: {
            sessionId: session.id,
            customerId: session.hashCustomerId,
            closedAt: closedAt.toISOString(),
          },
        },
      });
    });
  }

  async recordActivationAttempt(input: RecordActivationAttemptInput): Promise<void> {
    const normalizedIp = normalizeAuditValue(input.clientIp, 64);
    await this.prisma.auditLog.create({
      data: {
        actorType: AuditActorType.SYSTEM,
        actorId: normalizeAuditValue(
          input.customerId ? `customer:${input.customerId}` : `activation-ip:${normalizedIp}`,
          128,
        ),
        eventType: 'customer_session.activation_attempt',
        eventPayloadJson: {
          tokenHash: input.tokenHash,
          clientIp: normalizedIp,
          outcome: input.outcome,
          occurredAt: input.occurredAt.toISOString(),
          ...(input.customerId === undefined ? {} : { customerId: input.customerId }),
          ...(input.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: input.retryAfterSeconds }),
          ...(input.failureReason === undefined ? {} : { failureReason: input.failureReason }),
        },
      },
    });
  }

  async listApprovedItems(customerId: string): Promise<CustomerApprovedItem[]> {
    const items = await this.prisma.approvedItem.findMany({
      where: {
        hashCustomerId: customerId,
      },
      select: {
        hashItemId: true,
        addedByAgentId: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return items.map((item) => ({
      hashItemId: item.hashItemId,
      addedByAgentId: item.addedByAgentId,
      createdAt: item.createdAt.toISOString(),
    }));
  }
}

function normalizeAuditValue(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'unknown';
  }

  return trimmed.length <= maxLength ? trimmed : trimmed.slice(0, maxLength);
}
