import { describe, expect, it } from 'vitest';

import {
  createActivationIdleState,
  markActivationError,
  markActivationReady,
  markActivationStarted,
  markActivationWeakNetwork,
} from './token-activation-route';

describe('token activation bootstrap state', () => {
  it('boots route state for /m/[token] and transitions to ready /order payload', () => {
    const idle = createActivationIdleState(' token-abc ');
    expect(idle).toEqual({
      status: 'idle',
      route: '/m/token-abc',
      token: 'token-abc',
      canRetry: true,
      weakNetworkHint: false,
    });

    const activating = markActivationStarted(idle, 1_000);
    expect(activating).toEqual({
      status: 'activating',
      route: '/m/token-abc',
      token: 'token-abc',
      canRetry: false,
      startedAtMs: 1_000,
      weakNetworkHint: false,
    });

    const ready = markActivationReady({
      sessionToken: 'session-jwt',
      customer: { customerId: 'cust-17' },
      sessionExpiresAt: '2026-04-08T14:00:00.000Z',
    });

    expect(ready).toEqual({
      status: 'ready',
      route: '/order',
      canRetry: false,
      sessionToken: 'session-jwt',
      customerId: 'cust-17',
      sessionExpiresAt: '2026-04-08T14:00:00.000Z',
    });
  });

  it('surfaces weak-network hint and resilient retryable errors', () => {
    const activating = markActivationStarted(createActivationIdleState('t-1'), 0);
    const stillLoading = markActivationWeakNetwork(activating, 2_000);
    expect(stillLoading).toEqual(activating);

    const weakNetwork = markActivationWeakNetwork(stillLoading, 2_501);
    expect(weakNetwork).toEqual({
      status: 'activating',
      route: '/m/t-1',
      token: 't-1',
      canRetry: false,
      startedAtMs: 0,
      weakNetworkHint: true,
    });

    expect(markActivationError(weakNetwork, 'network')).toEqual({
      status: 'error',
      route: '/m/t-1',
      token: 't-1',
      canRetry: true,
      weakNetworkHint: true,
      reason: 'network',
      message: 'Connection is unstable. Check your signal and retry.',
    });
  });
});
