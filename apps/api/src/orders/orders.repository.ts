import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { AuditActorType, IdempotencyScope, MagicLinkStatus, OrderStatus, Prisma, PrismaClient, SessionStatus } from '@prisma/client';

import type { AgentOrdersRepository } from './agent-orders.types';
import { CUSTOMER_ORDER_ERP_UNAVAILABLE_CODE } from './orders.errors';
import type {
  OrderSubmitReplay,
  OrdersRepository,
  PersistOrderSubmissionInput,
  ReserveIdempotencyKeyInput,
  ReserveIdempotencyKeyResult,
} from './orders.types';

@Injectable()
export class PrismaOrdersRepository implements OrdersRepository, AgentOrdersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async reserveIdempotencyKey(input: ReserveIdempotencyKeyInput): Promise<ReserveIdempotencyKeyResult> {
    const created = await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "idempotency_keys" ("scope", "key", "hash_customer_id", "customer_session_id", "request_hash")
      VALUES (
        ${IdempotencyScope.CUSTOMER_ORDER_SUBMIT}::"IdempotencyScope",
        ${input.key},
        ${input.customerId},
        ${input.customerSessionId}::UUID,
        ${input.requestHash}
      )
      ON CONFLICT ("scope", "key") DO NOTHING
      RETURNING "id"
    `;

    if (created.length > 0) {
      return {
        kind: 'reserved',
        idempotencyId: created[0].id,
      };
    }

    const [existing] = await this.prisma.$queryRaw<
      Array<{
        hashCustomerId: string;
        customerSessionId: string;
        requestHash: string;
        responseStatus: number | null;
        responseBodyJson: Prisma.JsonValue | null;
      }>
    >`
      SELECT
        "hash_customer_id" AS "hashCustomerId",
        "customer_session_id"::TEXT AS "customerSessionId",
        "request_hash" AS "requestHash",
        "response_status" AS "responseStatus",
        "response_body_json" AS "responseBodyJson"
      FROM "idempotency_keys"
      WHERE "scope" = ${IdempotencyScope.CUSTOMER_ORDER_SUBMIT}::"IdempotencyScope"
        AND "key" = ${input.key}
      LIMIT 1
    `;

    if (
      !existing ||
      existing.hashCustomerId !== input.customerId ||
      existing.customerSessionId !== input.customerSessionId ||
      existing.requestHash !== input.requestHash
    ) {
      return { kind: 'conflict' };
    }

    if (existing.responseStatus === null || existing.responseBodyJson === null) {
      return { kind: 'conflict' };
    }

    const replayBody = toReplayBody(existing.responseBodyJson);
    if (!replayBody) {
      return { kind: 'conflict' };
    }

    return {
      kind: 'replay',
      replay: {
        statusCode: existing.responseStatus,
        body: replayBody,
      },
    };
  }

  async finalizeIdempotencyKey(
    idempotencyId: string,
    replay: OrderSubmitReplay,
    responseHash: string,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "idempotency_keys"
      SET
        "response_hash" = ${responseHash},
        "response_status" = ${replay.statusCode},
        "response_body_json" = ${JSON.stringify(replay.body)}::JSONB
      WHERE "id" = ${idempotencyId}::UUID
    `;
  }

  async persistOrderSubmission(input: PersistOrderSubmissionInput): Promise<void> {
    const submittedAt = new Date(input.submittedAt);
    const orderStatus = toOrderStatus(input.status);

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          id: input.orderId,
          customerSessionId: input.customerSessionId,
          hashCustomerId: input.customerId,
          hashOrderRef: input.orderRef,
          status: orderStatus,
          submittedAt,
          estimatedTotal: new Prisma.Decimal(input.estimatedTotal),
          currency: 'ILS',
          orderLines: {
            create: input.lines.map((line) => ({
              hashItemId: line.itemId,
              itemNameSnapshot: line.itemNameSnapshot,
              quantity: new Prisma.Decimal(line.quantity),
              unit: line.unit,
              unitPriceSnapshot: new Prisma.Decimal(line.unitPriceSnapshot),
              lineTotalSnapshot: new Prisma.Decimal(line.lineTotalSnapshot),
            })),
          },
        },
        select: {
          id: true,
        },
      });

      if (input.consumeSession && orderStatus === OrderStatus.SUBMITTED) {
        const session = await tx.session.findUnique({
          where: {
            id: input.customerSessionId,
          },
          select: {
            id: true,
            magicLinkId: true,
          },
        });

        if (session) {
          const consumedAt = new Date();

          await tx.session.update({
            where: {
              id: session.id,
            },
            data: {
              status: SessionStatus.CLOSED,
              isActive: false,
            },
          });

          await tx.magicLink.update({
            where: {
              id: session.magicLinkId,
            },
            data: {
              status: MagicLinkStatus.CONSUMED,
              consumedAt,
            },
          });

          await tx.auditLog.createMany({
            data: [
              {
                actorType: AuditActorType.CUSTOMER_SESSION,
                actorId: input.customerSessionId,
                eventType: 'customer_order.submitted',
                eventPayloadJson: {
                  orderId: input.orderId,
                  orderRef: input.orderRef,
                },
              },
              {
                actorType: AuditActorType.SYSTEM,
                actorId: input.customerSessionId,
                eventType: 'customer_session.closed',
                eventPayloadJson: {
                  sessionId: input.customerSessionId,
                  orderId: order.id,
                },
              },
              {
                actorType: AuditActorType.SYSTEM,
                actorId: input.customerId,
                eventType: 'magic_link.consumed',
                eventPayloadJson: {
                  magicLinkId: session.magicLinkId,
                  orderId: order.id,
                },
              },
            ],
          });

          return;
        }
      }

      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.CUSTOMER_SESSION,
          actorId: input.customerSessionId,
          eventType: 'customer_order.submitted',
          eventPayloadJson: {
            orderId: input.orderId,
            orderRef: input.orderRef,
          },
        },
      });
    });
  }

  async listAgentOrders(input: {
    agentId: string;
    page: number;
    pageSize: number;
    fromDate?: string;
    toDate?: string;
    query?: string;
  }): Promise<{
    orders: Array<{
      orderId: string;
      orderRef: string | null;
      customerId: string;
      customerName: string;
      submittedAt: string;
      status: 'submitted' | 'pending_retry' | 'failed';
      estimatedTotal: number;
      currency: string;
      items: Array<{
        itemId: string;
        itemName: string;
        quantity: number;
        unit: 'kg';
        lineTotal: number;
      }>;
      canCancel: boolean;
      orderStatus: 'submitted' | 'pending_retry' | 'failed';
    }>;
    total: number;
  }> {
    const assignments = await this.prisma.assignment.findMany({
      where: { agentId: input.agentId },
      select: { hashCustomerId: true },
    });
    const assignedCustomerIds = [...new Set(assignments.map((assignment) => assignment.hashCustomerId))];
    if (assignedCustomerIds.length === 0) {
      return { orders: [], total: 0 };
    }

    const where: Prisma.OrderWhereInput = {
      hashCustomerId: { in: assignedCustomerIds },
    };

    const submittedAtFilter = buildSubmittedAtFilter(input.fromDate, input.toDate);
    if (submittedAtFilter) {
      where.submittedAt = submittedAtFilter;
    }

    const searchFilter = buildOrderSearchFilter(input.query?.trim() ?? '');
    if (searchFilter) {
      where.OR = searchFilter;
    }

    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        skip: Math.max(0, (input.page - 1) * input.pageSize),
        take: input.pageSize,
        select: {
          id: true,
          hashOrderRef: true,
          hashCustomerId: true,
          submittedAt: true,
          status: true,
          estimatedTotal: true,
          currency: true,
          orderLines: {
            select: {
              hashItemId: true,
              itemNameSnapshot: true,
              quantity: true,
              unit: true,
              lineTotalSnapshot: true,
            },
            orderBy: [{ id: 'asc' }],
          },
        },
      }),
    ]);

    return {
      total,
      orders: rows.map((row) => {
        const status = toContractOrderStatus(row.status);
        return {
          orderId: row.id,
          orderRef: row.hashOrderRef,
          customerId: row.hashCustomerId,
          customerName: humanizeCustomerId(row.hashCustomerId),
          submittedAt: row.submittedAt.toISOString(),
          status,
          orderStatus: status,
          estimatedTotal: Number(row.estimatedTotal),
          currency: row.currency,
          items: row.orderLines.map((line) => ({
            itemId: line.hashItemId,
            itemName: line.itemNameSnapshot,
            quantity: Number(line.quantity),
            unit: 'kg',
            lineTotal: Number(line.lineTotalSnapshot),
          })),
          canCancel: status !== 'failed',
        };
      }),
    };
  }

  async findAgentOrderForCancel(
    agentId: string,
    orderId: string,
  ): Promise<{
    orderId: string;
    orderRef: string | null;
    customerId: string;
    status: 'submitted' | 'pending_retry' | 'failed';
  } | null> {
    const assignments = await this.prisma.assignment.findMany({
      where: { agentId },
      select: { hashCustomerId: true },
    });
    const assignedCustomerIds = [...new Set(assignments.map((assignment) => assignment.hashCustomerId))];
    if (assignedCustomerIds.length === 0) {
      return null;
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        hashCustomerId: { in: assignedCustomerIds },
      },
      select: {
        id: true,
        hashOrderRef: true,
        hashCustomerId: true,
        status: true,
      },
    });
    if (!order) {
      return null;
    }

    return {
      orderId: order.id,
      orderRef: order.hashOrderRef,
      customerId: order.hashCustomerId,
      status: toContractOrderStatus(order.status),
    };
  }

  async deleteOrder(orderId: string): Promise<void> {
    await this.prisma.order.delete({
      where: { id: orderId },
    });
  }
}

function toOrderStatus(status: PersistOrderSubmissionInput['status']): OrderStatus {
  if (status === 'submitted') {
    return OrderStatus.SUBMITTED;
  }

  if (status === 'pending_retry') {
    return OrderStatus.PENDING_RETRY;
  }

  return OrderStatus.FAILED;
}

function toReplayBody(value: Prisma.JsonValue): OrderSubmitReplay['body'] | null {
  if (!isJsonRecord(value)) {
    return null;
  }

  const orderId = value.orderId;
  const orderRef = value.orderRef;
  const status = value.status;
  if (
    typeof orderId === 'string' &&
    typeof orderRef === 'string' &&
    (status === 'submitted' || status === 'pending_retry' || status === 'failed')
  ) {
    return {
      orderId,
      orderRef,
      status,
    };
  }

  const code = value.code;
  const lines = value.lines;
  if (code === 'ORDER_LINES_MISMATCH' && Array.isArray(lines)) {
    const parsedLines: Array<{
      lineIndex: number;
      itemId: string;
      reason: string;
      submittedUnitPrice?: number;
      currentUnitPrice?: number;
    }> = [];

    for (const line of lines) {
      if (!isJsonRecord(line)) {
        return null;
      }

      const lineIndex = line.lineIndex;
      const itemId = line.itemId;
      const reason = line.reason;
      const submittedUnitPrice = line.submittedUnitPrice;
      const currentUnitPrice = line.currentUnitPrice;

      if (
        typeof lineIndex !== 'number' ||
        typeof itemId !== 'string' ||
        typeof reason !== 'string' ||
        (submittedUnitPrice !== undefined && typeof submittedUnitPrice !== 'number') ||
        (currentUnitPrice !== undefined && typeof currentUnitPrice !== 'number')
      ) {
        return null;
      }

      parsedLines.push({
        lineIndex,
        itemId,
        reason,
        ...(submittedUnitPrice === undefined ? {} : { submittedUnitPrice }),
        ...(currentUnitPrice === undefined ? {} : { currentUnitPrice }),
      });
    }

    return {
      code,
      lines: parsedLines,
    };
  }

  const message = value.message;
  if (code === CUSTOMER_ORDER_ERP_UNAVAILABLE_CODE && typeof message === 'string') {
    return {
      code,
      message,
    };
  }

  return null;
}

function isJsonRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function buildSubmittedAtFilter(fromDate?: string, toDate?: string): Prisma.DateTimeFilter | null {
  const filter: Prisma.DateTimeFilter = {};
  const parsedFrom = parseDateOrNull(fromDate);
  if (parsedFrom) {
    filter.gte = parsedFrom;
  }

  const parsedTo = parseDateOrNull(toDate);
  if (parsedTo) {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(toDate ?? '');
    if (isDateOnly) {
      parsedTo.setUTCHours(23, 59, 59, 999);
    }
    filter.lte = parsedTo;
  }

  return Object.keys(filter).length > 0 ? filter : null;
}

function parseDateOrNull(value?: string): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildOrderSearchFilter(query: string): Prisma.OrderWhereInput['OR'] | null {
  if (!query) {
    return null;
  }

  const customerQueryCandidates = new Set<string>([
    query,
    query.toLowerCase().replace(/\s+/g, '-'),
    `cust-${query.toLowerCase().replace(/\s+/g, '-')}`,
  ]);

  const customerIdFilters: Prisma.OrderWhereInput[] = [...customerQueryCandidates]
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0)
    .map((candidate) => ({
      hashCustomerId: {
        contains: candidate,
        mode: 'insensitive',
      },
    }));

  return [
    ...customerIdFilters,
    {
      hashOrderRef: {
        contains: query,
        mode: 'insensitive',
      },
    },
    {
      orderLines: {
        some: {
          OR: [
            {
              hashItemId: {
                contains: query,
                mode: 'insensitive',
              },
            },
            {
              itemNameSnapshot: {
                contains: query,
                mode: 'insensitive',
              },
            },
          ],
        },
      },
    },
  ];
}

function humanizeCustomerId(customerId: string): string {
  const normalized = customerId
    .trim()
    .replace(/^cust-/, '')
    .replaceAll('-', ' ')
    .replace(/\s+/g, ' ');
  if (!normalized) {
    return customerId;
  }

  return normalized
    .split(' ')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function toContractOrderStatus(status: OrderStatus): 'submitted' | 'pending_retry' | 'failed' {
  if (status === OrderStatus.SUBMITTED) {
    return 'submitted';
  }
  if (status === OrderStatus.PENDING_RETRY) {
    return 'pending_retry';
  }
  return 'failed';
}

export function createResponseHash(replay: OrderSubmitReplay): string {
  return createHash('sha256')
    .update(JSON.stringify({ statusCode: replay.statusCode, body: replay.body }))
    .digest('hex');
}
