import { HttpException, HttpStatus } from '@nestjs/common';

export class CustomerActivationTokenInvalidError extends HttpException {
  constructor() {
    super(
      {
        code: 'CUSTOMER_SESSION_ACTIVATION_TOKEN_INVALID',
        message: 'Activation token is invalid',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class CustomerActivationTokenExpiredError extends HttpException {
  constructor() {
    super(
      {
        code: 'CUSTOMER_SESSION_ACTIVATION_TOKEN_EXPIRED',
        message: 'Activation token has expired',
      },
      HttpStatus.GONE,
    );
  }
}

export class CustomerSessionTokenMissingError extends HttpException {
  constructor() {
    super(
      {
        code: 'AUTH_CUSTOMER_SESSION_TOKEN_REQUIRED',
        message: 'Customer session token is required',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class CustomerSessionTokenInvalidError extends HttpException {
  constructor() {
    super(
      {
        code: 'AUTH_CUSTOMER_SESSION_TOKEN_INVALID',
        message: 'Customer session token is invalid',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class CustomerSessionExpiredError extends HttpException {
  constructor() {
    super(
      {
        code: 'AUTH_CUSTOMER_SESSION_EXPIRED',
        message: 'Customer session has expired',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class CustomerActivationRateLimitedError extends HttpException {
  constructor(retryAfterSeconds: number) {
    super(
      {
        code: 'CUSTOMER_SESSION_ACTIVATION_RATE_LIMITED',
        message: 'Too many activation attempts. Try again later.',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
