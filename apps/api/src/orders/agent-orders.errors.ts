import { HttpException, HttpStatus } from '@nestjs/common';

export class AgentOrderNotFoundError extends HttpException {
  constructor(orderId: string) {
    super(
      {
        code: 'AGENT_ORDER_NOT_FOUND',
        message: `Order ${orderId} was not found for this agent`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class AgentOrderCancelUnavailableError extends HttpException {
  constructor() {
    super(
      {
        code: 'AGENT_ORDER_CANCEL_UNAVAILABLE',
        message: 'Unable to cancel this order right now. Please retry shortly.',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
