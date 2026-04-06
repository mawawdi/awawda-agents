import { HttpException, HttpStatus } from '@nestjs/common';

export class AgentAssignmentRequiredError extends HttpException {
  constructor() {
    super(
      {
        code: 'AUTH_AGENT_CUSTOMER_ASSIGNMENT_REQUIRED',
        message: 'Agent is not assigned to this customer',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
