import { HttpException, HttpStatus } from '@nestjs/common';

export class InvalidCredentialsError extends HttpException {
  constructor() {
    super(
      {
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}
