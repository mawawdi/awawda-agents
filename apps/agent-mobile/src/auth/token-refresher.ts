/**
 * Module-level singleton for coordinating token refresh across all API calls.
 * AuthProvider registers its refresh callback once on bootstrap.
 * requestAgentApi calls executeRefresh() on 401 to get a fresh access token.
 */

type RefreshCallback = () => Promise<string | null>

let _refreshCallback: RefreshCallback | null = null
let _refreshPromise: Promise<string | null> | null = null
let _sessionGeneration = 0

export function registerRefreshCallback(cb: RefreshCallback): void {
  _refreshCallback = cb
}

export function unregisterRefreshCallback(): void {
  _refreshCallback = null
  _sessionGeneration++
}

/**
 * Invalidate the current authenticated session (on sign-out) WITHOUT dropping the callback.
 * The AuthProvider stays mounted across logout/login, so the singleton must keep a live callback
 * for the next session; bumping the generation discards any in-flight refresh so it cannot
 * resurrect the session that was just signed out.
 */
export function invalidateRefreshSession(): void {
  _sessionGeneration++
  _refreshPromise = null
}

/**
 * Execute a token refresh. Concurrent callers share one in-flight promise (mutex).
 * Returns the new access token, or null if refresh failed (=> force sign-out).
 */
export function executeRefresh(): Promise<string | null> {
  if (_refreshPromise) {
    return _refreshPromise
  }

  if (!_refreshCallback) {
    return Promise.resolve(null)
  }

  const generationAtStart = _sessionGeneration

  _refreshPromise = _refreshCallback()
    .then((token) => {
      // Discard result if sign-out happened while we were refreshing
      if (_sessionGeneration !== generationAtStart) {
        return null
      }
      return token
    })
    .catch(() => null)
    .finally(() => {
      _refreshPromise = null
    })

  return _refreshPromise
}
