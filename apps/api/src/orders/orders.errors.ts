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
