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
    try {
      const created = await this.prisma.idempotencyKey.create({
        data: {
          scope: IdempotencyScope.CUSTOMER_ORDER_SUBMIT,
          key: input.key,
          hashCustomerId: input.customerId,
          customerSessionId: input.customerSessionId,
          requestHash: input.requestHash,
        },
        select: {
          id: true,
        },
      });

      return {
        kind: 'reserved',
        idempotencyId: created.id,
      };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
    }

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: {
        scope_key: {
          scope: IdempotencyScope.CUSTOMER_ORDER_SUBMIT,
          key: input.key,
        },
      },
      select: {
        hashCustomerId: true,
        customerSessionId: true,
        requestHash: true,
        responseStatus: true,
        responseBodyJson: true,
      },
    });

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

    return {
      kind: 'replay',
      replay: {
        statusCode: existing.responseStatus,
        body: existing.responseBodyJson as unknown as OrderSubmitReplay['body'],
      },
    };
  }

  async finalizeIdempotencyKey(
    idempotencyId: string,
    replay: OrderSubmitReplay,
    responseHash: string,
  ): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: {
        id: idempotencyId,
      },
      data: {
        responseHash,
        responseStatus: replay.statusCode,
        responseBodyJson: replay.body as unknown as Prisma.InputJsonValue,
      },
    });
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

export function createResponseHash(replay: OrderSubmitReplay): string {
  return createHash('sha256')
    .update(JSON.stringify({ statusCode: replay.statusCode, body: replay.body }))
    .digest('hex');
}
