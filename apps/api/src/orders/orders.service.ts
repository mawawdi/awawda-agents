import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type {
  CustomerOrderMismatchResponse,
  CustomerOrderSubmitRequest,
  CustomerOrderSubmitResponse,
} from '@awawda/shared-types';

import { buildTestingCatalogItems } from '../catalog/data/testing-cuts-catalog';
import { isErpGatewayError } from '../erp/erp.errors';
import { ERP_GATEWAY, type ErpGateway } from '../erp/erp.gateway';
import { CUSTOMER_SESSIONS_REPOSITORY } from '../sessions/sessions.constants';
import type { CustomerSessionsRepository } from '../sessions/sessions.types';
import { ORDERS_REPOSITORY } from './orders.constants';
import {
  createCustomerOrderErpUnavailableBody,
  CustomerOrderIdempotencyKeyConflictError,
} from './orders.errors';
import { createResponseHash } from './orders.repository';
import type { OrderSubmitReplay, OrdersRepository } from './orders.types';

export type SubmitOrderContext = {
  customerId: string;
  customerSessionId: string;
  idempotencyKey: string;
};

const TESTING_CATALOG_NAME_BY_ITEM_ID = new Map(buildTestingCatalogItems().map((item) => [item.itemId, item.name]));

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
    const normalizedRequest = normalizeOrderSubmitRequest(request);
    const requestHash = hashRequestPayload(normalizedRequest);
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

    const approvedItems = await this.customerSessionsRepository.listApprovedItems(context.customerId);
    let recentItemsSnapshot: Awaited<ReturnType<ErpGateway['getCustomerRecentItems']>>;
    let pricingSnapshot: Awaited<ReturnType<ErpGateway['getCustomerPricing']>>;

    try {
      [recentItemsSnapshot, pricingSnapshot] = await Promise.all([
        this.erpGateway.getCustomerRecentItems(context.customerId),
        this.erpGateway.getCustomerPricing(context.customerId),
      ]);
    } catch (error) {
      if (isErpGatewayError(error)) {
        const replay: OrderSubmitReplay = {
          statusCode: 503,
          body: createCustomerOrderErpUnavailableBody(),
        };
        await this.ordersRepository.finalizeIdempotencyKey(
          reservation.idempotencyId,
          replay,
          createResponseHash(replay),
        );
        return replay;
      }
      throw error;
    }

    const approvedItemIds = new Set(approvedItems.map((item) => item.hashItemId));
    const recentItemIds = new Set(recentItemsSnapshot.items.map((item) => item.itemId));
    const recentItemNames = new Map(recentItemsSnapshot.items.map((item) => [item.itemId, item.name]));
    const pricingByItemId = new Map(pricingSnapshot.lines.map((line) => [line.itemId, line]));

    const mismatchLines: CustomerOrderMismatchResponse['lines'] = [];
    for (const [lineIndex, line] of normalizedRequest.lines.entries()) {
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
    const agentInfo = await this.customerSessionsRepository.resolveSessionAgent(context.customerSessionId);
    let erpResponse: Awaited<ReturnType<ErpGateway['handoffOrder']>>;
    try {
      erpResponse = await this.erpGateway.handoffOrder({
        orderId,
        customerId: context.customerId,
        lines: normalizedRequest.lines,
        notes: request.notes,
        hashAgentId: agentInfo?.hashAgentId ?? undefined,
      });
    } catch (error) {
      if (isErpGatewayError(error)) {
        const replay: OrderSubmitReplay = {
          statusCode: 503,
          body: createCustomerOrderErpUnavailableBody(),
        };
        await this.ordersRepository.finalizeIdempotencyKey(
          reservation.idempotencyId,
          replay,
          createResponseHash(replay),
        );
        return replay;
      }
      throw error;
    }

    const linesWithSnapshots = normalizedRequest.lines.map((line) => {
      const unitPrice = pricingByItemId.get(line.itemId)?.unitPrice ?? line.clientUnitPrice;
      return {
        ...line,
        itemNameSnapshot: resolveItemNameSnapshot(line.itemId, recentItemNames.get(line.itemId)),
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
      submittedByAgentId: agentInfo?.agentId ?? null,
      hashSubmittedByAgentId: agentInfo?.hashAgentId ?? null,
      lines: linesWithSnapshots,
      estimatedTotal: linesWithSnapshots.reduce((sum, line) => sum + line.lineTotalSnapshot, 0),
      requestedDeliveryDate: normalizedRequest.requestedDeliveryDate ?? null,
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
    requestedDeliveryDate: request.requestedDeliveryDate ?? null,
    lines: request.lines.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      unit: line.unit,
      clientUnitPrice: line.clientUnitPrice,
    })),
  };

  return createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');
}

function normalizeOrderSubmitRequest(request: CustomerOrderSubmitRequest): CustomerOrderSubmitRequest {
  return {
    ...request,
    lines: request.lines.map((line) => ({
      ...line,
      unit: 'kg',
    })),
  };
}

function resolveItemNameSnapshot(itemId: string, recentItemName: string | undefined): string {
  const normalizedRecentName = recentItemName?.trim() ?? '';
  if (normalizedRecentName && !looksLikeRawItemIdentifier(normalizedRecentName, itemId)) {
    return normalizedRecentName;
  }

  const localizedTestingName = TESTING_CATALOG_NAME_BY_ITEM_ID.get(itemId);
  if (localizedTestingName) {
    return localizedTestingName;
  }

  if (normalizedRecentName) {
    return normalizedRecentName;
  }

  return itemId;
}

function looksLikeRawItemIdentifier(name: string, itemId: string): boolean {
  const normalizedName = name.trim().toLowerCase();
  const normalizedItemId = itemId.trim().toLowerCase();
  if (!normalizedName) {
    return false;
  }

  if (normalizedName === normalizedItemId) {
    return true;
  }

  if (/^\d{1,4}$/.test(normalizedName)) {
    return true;
  }

  return false;
}

function areEqualMoneyValues(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.001;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
