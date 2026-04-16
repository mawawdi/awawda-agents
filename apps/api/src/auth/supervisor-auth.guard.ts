import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { SupervisorRoleRequiredError } from './auth.errors';

type SupervisorRequest = {
  headers: {
    'x-agent-role'?: 'field_agent' | 'supervisor';
  };
};

@Injectable()
export class SupervisorAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SupervisorRequest>();

    if (request.headers['x-agent-role'] !== 'supervisor') {
      throw new SupervisorRoleRequiredError();
    }

    return true;
  }
}
