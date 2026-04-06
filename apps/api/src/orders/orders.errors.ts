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
