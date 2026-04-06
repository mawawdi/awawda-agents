export type AuthShellState =
  | { status: 'bootstrapping'; canRetry: false }
  | { status: 'signed_out'; canRetry: true; errorMessage?: string }
  | { status: 'signed_in'; canRetry: false; accessToken: string; agentName: string };

export function createBootstrappingState(): AuthShellState {
  return { status: 'bootstrapping', canRetry: false };
}

export function restoreFailed(message: string): AuthShellState {
  return {
    status: 'signed_out',
    canRetry: true,
    errorMessage: message,
  };
}

export function loginSucceeded(accessToken: string, agentName: string): AuthShellState {
  return {
    status: 'signed_in',
    canRetry: false,
    accessToken,
    agentName,
  };
}

export function logoutCompleted(): AuthShellState {
  return {
    status: 'signed_out',
    canRetry: true,
  };
}
