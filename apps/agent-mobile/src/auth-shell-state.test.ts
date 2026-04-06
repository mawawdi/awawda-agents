import { describe, expect, it } from 'vitest';

import {
  createBootstrappingState,
  loginSucceeded,
  logoutCompleted,
  restoreFailed,
} from './auth-shell-state';

describe('auth shell critical UI state', () => {
  it('starts in bootstrapping state while secure restore runs', () => {
    expect(createBootstrappingState()).toEqual({
      status: 'bootstrapping',
      canRetry: false,
    });
  });

  it('surfaces actionable error when restore fails', () => {
    expect(restoreFailed('Session expired. Please sign in again.')).toEqual({
      status: 'signed_out',
      canRetry: true,
      errorMessage: 'Session expired. Please sign in again.',
    });
  });

  it('marks user signed in after login success and signed out after logout', () => {
    expect(loginSucceeded('shift-token', 'Mona Parker')).toEqual({
      status: 'signed_in',
      canRetry: false,
      accessToken: 'shift-token',
      agentName: 'Mona Parker',
    });

    expect(logoutCompleted()).toEqual({
      status: 'signed_out',
      canRetry: true,
    });
  });
});
