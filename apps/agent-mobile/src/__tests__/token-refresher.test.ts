import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// token-refresher is a module-level singleton — each test must reset modules
// to get a clean slate with fresh _refreshCallback / _refreshPromise / _sessionGeneration.
async function freshRefresher() {
  vi.resetModules()
  return import('../auth/token-refresher')
}

afterEach(() => {
  vi.useRealTimers()
})

describe('token-refresher', () => {
  describe('executeRefresh with no callback', () => {
    it('returns null immediately when no callback is registered', async () => {
      const { executeRefresh } = await freshRefresher()
      await expect(executeRefresh()).resolves.toBeNull()
    })
  })

  describe('executeRefresh with callback', () => {
    it('calls the registered callback and returns its token', async () => {
      const { registerRefreshCallback, executeRefresh } = await freshRefresher()
      const cb = vi.fn().mockResolvedValue('fresh-access-token')
      registerRefreshCallback(cb)

      const result = await executeRefresh()

      expect(result).toBe('fresh-access-token')
      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('returns null when callback resolves null (refresh failed)', async () => {
      const { registerRefreshCallback, executeRefresh } = await freshRefresher()
      registerRefreshCallback(vi.fn().mockResolvedValue(null))

      await expect(executeRefresh()).resolves.toBeNull()
    })

    it('returns null when callback rejects (network error)', async () => {
      const { registerRefreshCallback, executeRefresh } = await freshRefresher()
      registerRefreshCallback(vi.fn().mockRejectedValue(new Error('network error')))

      await expect(executeRefresh()).resolves.toBeNull()
    })
  })

  describe('concurrency mutex', () => {
    it('concurrent executeRefresh calls share a single in-flight promise', async () => {
      const { registerRefreshCallback, executeRefresh } = await freshRefresher()
      let resolveCallback!: (v: string) => void
      const callCount = { value: 0 }

      registerRefreshCallback(() => {
        callCount.value++
        return new Promise<string>((resolve) => {
          resolveCallback = resolve
        })
      })

      const p1 = executeRefresh()
      const p2 = executeRefresh()
      const p3 = executeRefresh()

      resolveCallback('shared-token')

      const [r1, r2, r3] = await Promise.all([p1, p2, p3])
      expect(r1).toBe('shared-token')
      expect(r2).toBe('shared-token')
      expect(r3).toBe('shared-token')
      expect(callCount.value).toBe(1)
    })

    it('allows a new refresh after the previous promise settles', async () => {
      const { registerRefreshCallback, executeRefresh } = await freshRefresher()
      const cb = vi.fn().mockResolvedValue('token-v2')
      registerRefreshCallback(cb)

      await executeRefresh()
      await executeRefresh()

      expect(cb).toHaveBeenCalledTimes(2)
    })
  })

  describe('session generation (sign-out during refresh)', () => {
    it('discards in-flight refresh result when sign-out occurs before it resolves', async () => {
      const { registerRefreshCallback, unregisterRefreshCallback, executeRefresh } =
        await freshRefresher()

      let resolveCallback!: (v: string) => void
      registerRefreshCallback(
        () =>
          new Promise<string>((resolve) => {
            resolveCallback = resolve
          }),
      )

      const refreshPromise = executeRefresh()

      // Simulate sign-out: increments _sessionGeneration
      unregisterRefreshCallback()

      // Resolve the in-flight callback after sign-out
      resolveCallback('stale-token')

      const result = await refreshPromise
      expect(result).toBeNull()
    })

    it('allows normal refresh after re-registering a new callback', async () => {
      const { registerRefreshCallback, unregisterRefreshCallback, executeRefresh } =
        await freshRefresher()

      registerRefreshCallback(vi.fn().mockResolvedValue('first-session-token'))
      await executeRefresh()

      unregisterRefreshCallback()

      const newCb = vi.fn().mockResolvedValue('second-session-token')
      registerRefreshCallback(newCb)
      const result = await executeRefresh()

      expect(result).toBe('second-session-token')
      expect(newCb).toHaveBeenCalledTimes(1)
    })
  })
})
