import type { CustomerOrderMismatchLine } from '@awawda/shared-types';

export type OrderMismatchLine = CustomerOrderMismatchLine;

export type OrderSubmitState =
  | { status: 'idle'; canSubmit: true }
  | { status: 'submitting'; canSubmit: false }
  | { status: 'mismatch'; canSubmit: true; lines: OrderMismatchLine[] }
  | { status: 'error'; canSubmit: true; message: string }
  | { status: 'success'; canSubmit: false; orderRef: string };

export function createIdleState(): OrderSubmitState {
  return { status: 'idle', canSubmit: true };
}

export function markSubmitting(): OrderSubmitState {
  return { status: 'submitting', canSubmit: false };
}

export function markMismatch(lines: OrderMismatchLine[]): OrderSubmitState {
  return { status: 'mismatch', canSubmit: true, lines };
}

export function markSubmitError(message: string): OrderSubmitState {
  return { status: 'error', canSubmit: true, message };
}

export function markSuccess(orderRef: string): OrderSubmitState {
  return { status: 'success', canSubmit: false, orderRef };
}
