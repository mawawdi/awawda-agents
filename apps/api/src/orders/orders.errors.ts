import { HttpException, HttpStatus } from '@nestjs/common';

export class CustomerOrderIdempotencyKeyRequiredError extends HttpException {
  constructor() {
    super(
      {
        code: 'CUSTOMER_ORDER_IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency key header is required',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class CustomerOrderIdempotencyKeyConflictError extends HttpException {
  constructor() {
    super(
      {
        code: 'CUSTOMER_ORDER_IDEMPOTENCY_KEY_CONFLICT',
        message: 'Idempotency key is already used for a different order submission',
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class CustomerOrderSessionAlreadySubmittedError extends HttpException {
  constructor() {
    super(
      {
        code: 'CUSTOMER_ORDER_SESSION_ALREADY_SUBMITTED',
        message: 'An order has already been submitted for this session',
      },
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * Internal signal (not HTTP) raised by the repository when a concurrent submit already placed the
 * order for a single-use session — either the session-claim gate found the session already consumed,
 * or the partial unique index rejected a duplicate order. The service translates it into a
 * {@link CustomerOrderSessionAlreadySubmittedError}.
 */
export class OrderSessionConflictError extends Error {
  constructor() {
    super('An order already exists for this customer session');
    this.name = 'OrderSessionConflictError';
  }
}

export const CUSTOMER_ORDER_ERP_UNAVAILABLE_CODE = 'CUSTOMER_ORDER_ERP_UNAVAILABLE' as const;
export const CUSTOMER_ORDER_ERP_UNAVAILABLE_MESSAGE =
  'Order service is temporarily unavailable. Please retry in a moment.' as const;

export type CustomerOrderErpUnavailableResponse = {
  code: typeof CUSTOMER_ORDER_ERP_UNAVAILABLE_CODE;
  message: string;
};

export function createCustomerOrderErpUnavailableBody(): CustomerOrderErpUnavailableResponse {
  return {
    code: CUSTOMER_ORDER_ERP_UNAVAILABLE_CODE,
    message: CUSTOMER_ORDER_ERP_UNAVAILABLE_MESSAGE,
  };
}

export class CustomerOrderErpUnavailableError extends HttpException {
  constructor() {
    super(createCustomerOrderErpUnavailableBody(), HttpStatus.SERVICE_UNAVAILABLE);
  }
}
