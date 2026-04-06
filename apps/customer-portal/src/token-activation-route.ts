export type ActivationErrorReason = 'invalid_token' | 'expired_token' | 'network' | 'server';

export type ActivationBootstrapState =
  | {
      status: 'idle';
      route: `/m/${string}`;
      token: string;
      canRetry: true;
      weakNetworkHint: false;
    }
  | {
      status: 'activating';
      route: `/m/${string}`;
      token: string;
      canRetry: false;
      startedAtMs: number;
      weakNetworkHint: boolean;
    }
  | {
      status: 'ready';
      route: '/order';
      canRetry: false;
      sessionToken: string;
      customerId: string;
      sessionExpiresAt: string;
    }
  | {
      status: 'error';
      route: `/m/${string}`;
      token: string;
      canRetry: true;
      weakNetworkHint: boolean;
      reason: ActivationErrorReason;
      message: string;
    };

export interface ActivationPayload {
  sessionToken: string;
  customer: {
    customerId: string;
  };
  sessionExpiresAt: string;
}

const WEAK_NETWORK_THRESHOLD_MS = 2_500;

export function createActivationIdleState(token: string): ActivationBootstrapState {
  const normalizedToken = token.trim();

  return {
    status: 'idle',
    route: `/m/${encodeURIComponent(normalizedToken)}`,
    token: normalizedToken,
    canRetry: true,
    weakNetworkHint: false,
  };
}

export function markActivationStarted(
  state: ActivationBootstrapState,
  startedAtMs: number,
): ActivationBootstrapState {
  if (state.status === 'ready') {
    return state;
  }

  return {
    status: 'activating',
    route: state.route,
    token: state.token,
    canRetry: false,
    startedAtMs,
    weakNetworkHint: false,
  };
}

export function markActivationWeakNetwork(
  state: ActivationBootstrapState,
  nowMs: number,
): ActivationBootstrapState {
  if (state.status !== 'activating') {
    return state;
  }

  if (state.weakNetworkHint || nowMs - state.startedAtMs < WEAK_NETWORK_THRESHOLD_MS) {
    return state;
  }

  return {
    ...state,
    weakNetworkHint: true,
  };
}

export function markActivationReady(payload: ActivationPayload): ActivationBootstrapState {
  return {
    status: 'ready',
    route: '/order',
    canRetry: false,
    sessionToken: payload.sessionToken,
    customerId: payload.customer.customerId,
    sessionExpiresAt: payload.sessionExpiresAt,
  };
}

export function markActivationError(
  state: ActivationBootstrapState,
  reason: ActivationErrorReason,
): ActivationBootstrapState {
  if (state.status === 'ready') {
    return state;
  }

  return {
    status: 'error',
    route: state.route,
    token: state.token,
    canRetry: true,
    weakNetworkHint: state.weakNetworkHint,
    reason,
    message: activationErrorMessage(reason),
  };
}

function activationErrorMessage(reason: ActivationErrorReason): string {
  switch (reason) {
    case 'invalid_token':
      return 'This activation link is invalid. Request a new link from your sales rep.';
    case 'expired_token':
      return 'This activation link has expired. Request a fresh link to continue.';
    case 'network':
      return 'Connection is unstable. Check your signal and retry.';
    case 'server':
      return 'We could not open your order right now. Please try again shortly.';
  }
}
