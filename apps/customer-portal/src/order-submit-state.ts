export type OrderMismatchLine = {
  itemId: string;
  reason: string;
};

export type OrderSubmitState =
  | { status: 'idle'; canSubmit: true }
  | { status: 'submitting'; canSubmit: false }
  | { status: 'mismatch'; canSubmit: true; lines: OrderMismatchLine[] }
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

export function markSuccess(orderRef: string): OrderSubmitState {
  return { status: 'success', canSubmit: false, orderRef };
}
