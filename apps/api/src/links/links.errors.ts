import { HttpException, HttpStatus } from '@nestjs/common';

export class AgentCustomerAccessDeniedError extends HttpException {
  constructor() {
    super(
      {
        code: 'LINKS_CUSTOMER_NOT_ASSIGNED',
        message: 'Agent is not assigned to the requested customer',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
