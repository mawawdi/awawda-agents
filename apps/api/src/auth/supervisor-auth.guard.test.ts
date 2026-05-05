import { HttpStatus, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { SupervisorAuthGuard } from './supervisor-auth.guard';

function makeContext(role?: string): ExecutionContext {
  const headers: Record<string, string | undefined> = {};
  if (role !== undefined) {
    headers['x-agent-role'] = role;
  }

  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('SupervisorAuthGuard', () => {
  const guard = new SupervisorAuthGuard();

  it('returns true when x-agent-role is supervisor', () => {
    expect(guard.canActivate(makeContext('supervisor'))).toBe(true);
  });

  it('throws 403 AUTH_SUPERVISOR_REQUIRED when header is missing', () => {
    expect(() => guard.canActivate(makeContext())).toThrow(
      expect.objectContaining({
        status: HttpStatus.FORBIDDEN,
        response: expect.objectContaining({ code: 'AUTH_SUPERVISOR_REQUIRED' }),
      }),
    );
  });

  it('throws 403 when role is field_agent', () => {
    expect(() => guard.canActivate(makeContext('field_agent'))).toThrow(
      expect.objectContaining({
        status: HttpStatus.FORBIDDEN,
        response: expect.objectContaining({ code: 'AUTH_SUPERVISOR_REQUIRED' }),
      }),
    );
  });

  it('throws 403 when role is an unexpected value', () => {
    expect(() => guard.canActivate(makeContext('admin'))).toThrow(
      expect.objectContaining({ status: HttpStatus.FORBIDDEN }),
    );
  });
});
