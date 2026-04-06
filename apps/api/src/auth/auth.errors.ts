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

export class AgentTokenMissingError extends HttpException {
  constructor() {
    super(
      {
        code: 'AUTH_AGENT_TOKEN_REQUIRED',
        message: 'Agent access token is required',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

export class AgentTokenInvalidError extends HttpException {
  constructor() {
    super(
      {
        code: 'AUTH_AGENT_TOKEN_INVALID',
        message: 'Agent access token is invalid',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}
