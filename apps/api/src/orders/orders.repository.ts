import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { AuditActorType, IdempotencyScope, MagicLinkStatus, OrderStatus, Prisma, PrismaClient, SessionStatus } from '@prisma/client';

import type {
  OrderSubmitReplay,
  OrdersRepository,
  PersistOrderSubmissionInput,
  ReserveIdempotencyKeyInput,
  ReserveIdempotencyKeyResult,
} from './orders.types';

@Injectable()
export class PrismaOrdersRepository implements OrdersRepository {
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

  return null;
}

function isJsonRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createResponseHash(replay: OrderSubmitReplay): string {
  return createHash('sha256')
    .update(JSON.stringify({ statusCode: replay.statusCode, body: replay.body }))
    .digest('hex');
}
