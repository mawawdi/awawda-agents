import { Injectable } from '@nestjs/common';
import { AuditActorType, MagicLinkStatus, PrismaClient, SessionStatus } from '@prisma/client';
import type { CustomerApprovedItem, CustomerRecentOrderEntry, CustomerRecentOrdersFeed } from '@awawda/shared-types';

import type {
  RecordActivationAttemptInput,
  CustomerSessionValidationResult,
  CustomerSessionsRepository,
  SessionActivationResult,
} from './sessions.types';

const RECENT_ORDERS_DEFAULT_PAGE_SIZE = 12;
const RECENT_ORDERS_SORT_ORDER = 'lastOrderedAt_desc_compositionSignature_asc' as const;

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

      const activationTransition = await tx.magicLink.updateMany({
        where: {
          id: magicLink.id,
          status: MagicLinkStatus.ISSUED,
        },
        data: {
          status: MagicLinkStatus.ACTIVATED,
          activatedAt: now,
        },
      });
      if (activationTransition.count === 0) {
        return { kind: 'invalid' };
      }

      let session: {
        id: string;
        hashCustomerId: string;
        sessionExpiresAt: Date;
      } | null = null;
      try {
        session = await tx.session.create({
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
      } catch (error) {
        if (isSessionMagicLinkUniqueConstraintError(error)) {
          return { kind: 'invalid' };
        }
        throw error;
      }
      if (session === null) {
        return { kind: 'invalid' };
      }

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

  async listRecentOrdersFeed(customerId: string, now: Date): Promise<CustomerRecentOrdersFeed> {
    const windowStartAt = computeRecentOrdersWindowStart(now);
    const orders = await this.prisma.order.findMany({
      where: {
        hashCustomerId: customerId,
        submittedAt: {
          gte: windowStartAt,
          lte: now,
        },
      },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      select: {
        submittedAt: true,
        orderLines: {
          select: {
            hashItemId: true,
            itemNameSnapshot: true,
            quantity: true,
            unit: true,
          },
        },
      },
    });

    const entriesBySignature = new Map<string, CustomerRecentOrderEntry>();

    for (const order of orders) {
      const normalized = normalizeOrderComposition(order.orderLines);
      if (!normalized) {
        continue;
      }

      const existing = entriesBySignature.get(normalized.signature);
      if (existing) {
        existing.orderCount += 1;
        if (order.submittedAt.toISOString() > existing.lastOrderedAt) {
          existing.lastOrderedAt = order.submittedAt.toISOString();
          existing.lines = normalized.lines;
        }
        continue;
      }

      entriesBySignature.set(normalized.signature, {
        compositionSignature: normalized.signature,
        lines: normalized.lines,
        lastOrderedAt: order.submittedAt.toISOString(),
        orderCount: 1,
      });
    }

    const entries = [...entriesBySignature.values()].sort((left, right) => {
      const byLastOrderedAt = right.lastOrderedAt.localeCompare(left.lastOrderedAt);
      if (byLastOrderedAt !== 0) {
        return byLastOrderedAt;
      }

      return left.compositionSignature.localeCompare(right.compositionSignature);
    });

    return {
      entries,
      total: entries.length,
      pageSize: RECENT_ORDERS_DEFAULT_PAGE_SIZE,
      sortBy: RECENT_ORDERS_SORT_ORDER,
      generatedAt: now.toISOString(),
      windowStartAt: windowStartAt.toISOString(),
    };
  }
}

function isSessionMagicLinkUniqueConstraintError(error: unknown): boolean {
  if (!isObject(error) || error.code !== 'P2002') {
    return false;
  }

  if (!isObject(error.meta)) {
    return true;
  }

  const target = error.meta.target;
  if (!Array.isArray(target)) {
    return true;
  }

  return target.some(
    (entry) => typeof entry === 'string' && (entry === 'magic_link_id' || entry === 'magicLinkId'),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function normalizeAuditValue(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'unknown';
  }

  return trimmed.length <= maxLength ? trimmed : trimmed.slice(0, maxLength);
}

function computeRecentOrdersWindowStart(now: Date): Date {
  const windowStart = new Date(now);
  windowStart.setUTCFullYear(windowStart.getUTCFullYear() - 1);
  return windowStart;
}

function normalizeOrderComposition(
  lines: Array<{
    hashItemId: string;
    itemNameSnapshot: string;
    quantity: { toString(): string };
    unit: string;
  }>,
): { signature: string; lines: CustomerRecentOrderEntry['lines'] } | null {
  const groupedLines = new Map<
    string,
    {
      normalizedItemId: string;
      itemName: string;
      quantity: number;
      unit: 'kg';
    }
  >();

  for (const line of lines) {
    const normalizedItemId = line.hashItemId.trim().toLowerCase();
    if (!normalizedItemId) {
      continue;
    }

    const unit = normalizeOrderLineUnit(line.unit);
    const quantity = normalizeOrderLineQuantity(line.quantity.toString());
    if (quantity <= 0) {
      continue;
    }

    const key = `${normalizedItemId}::${unit}`;
    const existing = groupedLines.get(key);
    if (existing) {
      existing.quantity = roundOrderLineQuantity(existing.quantity + quantity);
      continue;
    }

    groupedLines.set(key, {
      normalizedItemId,
      itemName: resolveLineItemName(line.itemNameSnapshot, normalizedItemId),
      quantity,
      unit,
    });
  }

  if (groupedLines.size === 0) {
    return null;
  }

  const sortedLines = [...groupedLines.values()].sort(
    (left, right) =>
      left.normalizedItemId.localeCompare(right.normalizedItemId) || left.unit.localeCompare(right.unit),
  );

  return {
    signature: sortedLines
      .map((line) => `${line.normalizedItemId}:${formatSignatureQuantity(line.quantity)}:${line.unit}`)
      .join('|'),
    lines: sortedLines.map((line) => ({
      itemId: line.normalizedItemId,
      itemName: line.itemName,
      quantity: line.quantity,
      unit: line.unit,
    })),
  };
}

function normalizeOrderLineUnit(unit: string): 'kg' {
  void unit;
  return 'kg';
}

function normalizeOrderLineQuantity(quantity: string): number {
  const parsed = Number(quantity);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return roundOrderLineQuantity(parsed);
}

function roundOrderLineQuantity(quantity: number): number {
  const rounded = Math.round(quantity * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatSignatureQuantity(quantity: number): string {
  return quantity.toFixed(3).replace(/\.?0+$/, '');
}

function resolveLineItemName(itemNameSnapshot: string, fallbackItemId: string): string {
  const normalizedName = itemNameSnapshot.trim();
  return normalizedName.length > 0 ? normalizedName : fallbackItemId;
}
