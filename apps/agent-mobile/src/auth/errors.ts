export function getAuthFailureMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Sign-in failed. Please try again.'
}
