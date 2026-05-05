import type {
  CustomerOrderMismatchResponse,
  CustomerOrderSubmitLine,
  CustomerOrderSubmitResponse,
} from '@awawda/shared-types';

import type { CustomerOrderErpUnavailableResponse } from './orders.errors';

export type OrderSubmitReplay = {
  statusCode: number;
  body: CustomerOrderSubmitResponse | CustomerOrderMismatchResponse | CustomerOrderErpUnavailableResponse;
};

export type ReserveIdempotencyKeyInput = {
  key: string;
  customerId: string;
  customerSessionId: string;
  requestHash: string;
};

export type ReserveIdempotencyKeyResult =
  | {
      kind: 'reserved';
      idempotencyId: string;
    }
  | {
      kind: 'replay';
      replay: OrderSubmitReplay;
    }
  | {
      kind: 'conflict';
    };

export type PersistOrderSubmissionInput = {
  orderId: string;
  customerId: string;
  customerSessionId: string;
  orderRef: string;
  status: 'submitted' | 'pending_retry' | 'failed';
  submittedAt: string;
  submittedByAgentId: string | null;
  hashSubmittedByAgentId: string | null;
  lines: Array<
    CustomerOrderSubmitLine & {
      itemNameSnapshot: string;
      unitPriceSnapshot: number;
      lineTotalSnapshot: number;
    }
  >;
  estimatedTotal: number;
  consumeSession: boolean;
};

export interface OrdersRepository {
  reserveIdempotencyKey(input: ReserveIdempotencyKeyInput): Promise<ReserveIdempotencyKeyResult>;
  finalizeIdempotencyKey(
    idempotencyId: string,
    replay: OrderSubmitReplay,
    responseHash: string,
  ): Promise<void>;
  persistOrderSubmission(input: PersistOrderSubmissionInput): Promise<void>;
}
