import { HttpException, HttpStatus } from '@nestjs/common';

export class SupervisorTargetAgentNotFoundError extends HttpException {
  constructor(agentId: string) {
    super(
      {
        code: 'SUPERVISOR_TARGET_AGENT_NOT_FOUND',
        message: `Target agent ${agentId} was not found`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class SupervisorTargetAgentNotAssignableError extends HttpException {
  constructor(agentId: string) {
    super(
      {
        code: 'SUPERVISOR_TARGET_AGENT_NOT_ASSIGNABLE',
        message: `Target agent ${agentId} cannot receive customer assignments`,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class SupervisorSelfDeactivationForbiddenError extends HttpException {
  constructor() {
    super(
      {
        code: 'SUPERVISOR_SELF_DEACTIVATION_FORBIDDEN',
        message: 'Supervisor cannot deactivate their own account',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class SupervisorBulkReassignInvalidInputError extends HttpException {
  constructor() {
    super(
      {
        code: 'SUPERVISOR_BULK_REASSIGN_INVALID_INPUT',
        message: 'Bulk reassignment requires different source and destination agents',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class SupervisorAgentAlreadyExistsError extends HttpException {
  constructor(field: 'phone' | 'email') {
    super(
      {
        code: 'SUPERVISOR_AGENT_ALREADY_EXISTS',
        message: `Agent with this ${field} already exists`,
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class SupervisorAssignmentAgentIdRequiredError extends HttpException {
  constructor() {
    super(
      {
        code: 'SUPERVISOR_ASSIGNMENT_AGENT_ID_REQUIRED',
        message: 'Agent id is required to unassign customer ownership',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
