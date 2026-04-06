import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type {
  CustomerOrderMismatchResponse,
  CustomerOrderSubmitRequest,
  CustomerOrderSubmitResponse,
} from '@meatland/shared-types';

import { ERP_GATEWAY, type ErpGateway } from '../erp/erp.gateway';
import { CUSTOMER_SESSIONS_REPOSITORY } from '../sessions/sessions.constants';
import type { CustomerSessionsRepository } from '../sessions/sessions.types';
import { ORDERS_REPOSITORY } from './orders.constants';
import { CustomerOrderIdempotencyKeyConflictError } from './orders.errors';
import { createResponseHash } from './orders.repository';
import type { OrderSubmitReplay, OrdersRepository } from './orders.types';

export type SubmitOrderContext = {
  customerId: string;
  customerSessionId: string;
  idempotencyKey: string;
};

@Injectable()
export class OrdersService {
  constructor(
    @Inject(ERP_GATEWAY) private readonly erpGateway: ErpGateway,
    @Inject(CUSTOMER_SESSIONS_REPOSITORY)
    private readonly customerSessionsRepository: CustomerSessionsRepository,
    @Inject(ORDERS_REPOSITORY) private readonly ordersRepository: OrdersRepository,
  ) {}

  async submitOrder(
    context: SubmitOrderContext,
    request: CustomerOrderSubmitRequest,
  ): Promise<OrderSubmitReplay> {
    const requestHash = hashRequestPayload(request);
    const reservation = await this.ordersRepository.reserveIdempotencyKey({
      key: context.idempotencyKey,
      customerId: context.customerId,
      customerSessionId: context.customerSessionId,
      requestHash,
    });

    if (reservation.kind === 'replay') {
      return reservation.replay;
    }

    if (reservation.kind === 'conflict') {
      throw new CustomerOrderIdempotencyKeyConflictError();
    }

    const [approvedItems, recentItemsSnapshot, pricingSnapshot] = await Promise.all([
      this.customerSessionsRepository.listApprovedItems(context.customerId),
      this.erpGateway.getCustomerRecentItems(context.customerId),
      this.erpGateway.getCustomerPricing(context.customerId),
    ]);

    const approvedItemIds = new Set(approvedItems.map((item) => item.hashItemId));
    const recentItemIds = new Set(recentItemsSnapshot.items.map((item) => item.itemId));
    const recentItemNames = new Map(recentItemsSnapshot.items.map((item) => [item.itemId, item.name]));
    const pricingByItemId = new Map(pricingSnapshot.lines.map((line) => [line.itemId, line]));

    const mismatchLines: CustomerOrderMismatchResponse['lines'] = [];
    for (const [lineIndex, line] of request.lines.entries()) {
      const priceLine = pricingByItemId.get(line.itemId);

      if (!approvedItemIds.has(line.itemId) && !recentItemIds.has(line.itemId)) {
        mismatchLines.push({
          lineIndex,
          itemId: line.itemId,
          reason: 'Item is no longer available in approved or recent scope',
        });
        continue;
      }

      if (!priceLine) {
        mismatchLines.push({
          lineIndex,
          itemId: line.itemId,
          reason: 'Item pricing is unavailable in ERP snapshot',
        });
        continue;
      }

      if (!areEqualMoneyValues(line.clientUnitPrice, priceLine.unitPrice)) {
        mismatchLines.push({
          lineIndex,
          itemId: line.itemId,
          reason: `ERP unit price changed from ${line.clientUnitPrice.toFixed(2)} to ${priceLine.unitPrice.toFixed(2)}`,
          submittedUnitPrice: line.clientUnitPrice,
          currentUnitPrice: priceLine.unitPrice,
        });
      }
    }

    if (mismatchLines.length > 0) {
      const replay: OrderSubmitReplay = {
        statusCode: 409,
        body: {
          code: 'ORDER_LINES_MISMATCH',
          lines: mismatchLines,
        },
      };

      await this.ordersRepository.finalizeIdempotencyKey(
        reservation.idempotencyId,
        replay,
        createResponseHash(replay),
      );

      return replay;
    }

    const orderId = randomUUID();
    const erpResponse = await this.erpGateway.handoffOrder({
      orderId,
      customerId: context.customerId,
      lines: request.lines,
      notes: request.notes,
    });

    const linesWithSnapshots = request.lines.map((line) => {
      const unitPrice = pricingByItemId.get(line.itemId)?.unitPrice ?? line.clientUnitPrice;
      return {
        ...line,
        itemNameSnapshot: recentItemNames.get(line.itemId) ?? line.itemId,
        unitPriceSnapshot: unitPrice,
        lineTotalSnapshot: roundMoney(line.quantity * unitPrice),
      };
    });

    const replay: OrderSubmitReplay = {
      statusCode: 201,
      body: {
        orderId,
        orderRef: erpResponse.externalRef,
        status: erpResponse.status,
      } satisfies CustomerOrderSubmitResponse,
    };

    await this.ordersRepository.persistOrderSubmission({
      orderId,
      customerId: context.customerId,
      customerSessionId: context.customerSessionId,
      orderRef: erpResponse.externalRef,
      status: erpResponse.status,
      submittedAt: erpResponse.acceptedAt,
      lines: linesWithSnapshots,
      estimatedTotal: linesWithSnapshots.reduce((sum, line) => sum + line.lineTotalSnapshot, 0),
      consumeSession: erpResponse.status === 'submitted',
    });

    await this.ordersRepository.finalizeIdempotencyKey(
      reservation.idempotencyId,
      replay,
      createResponseHash(replay),
    );

    return replay;
  }
}

function hashRequestPayload(request: CustomerOrderSubmitRequest): string {
  const canonicalPayload = {
    notes: request.notes?.trim() ?? null,
    lines: request.lines.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      unit: line.unit,
      clientUnitPrice: line.clientUnitPrice,
    })),
  };

  return createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');
}

function areEqualMoneyValues(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.001;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
