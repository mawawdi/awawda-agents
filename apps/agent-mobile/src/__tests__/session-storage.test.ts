import { beforeEach, describe, expect, it, vi } from 'vitest'

const secureStoreMock = {
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}

async function loadSessionStorageModule(platform: 'web' | 'ios') {
  vi.resetModules()
  vi.doMock('react-native', () => ({
    Platform: { OS: platform },
  }))
  vi.doMock('expo-secure-store', () => secureStoreMock)

  return import('../session/session-storage')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  secureStoreMock.getItemAsync.mockResolvedValue(null)
  secureStoreMock.setItemAsync.mockResolvedValue(undefined)
  secureStoreMock.deleteItemAsync.mockResolvedValue(undefined)
})

describe('session storage', () => {
  it('uses web localStorage on web', async () => {
    const profile = {
      id: 'agent-1',
      name: 'Agent One',
      phone: '0500000000',
      email: 'agent.one@test.local',
      role: 'field_agent',
    } as const
    const webStorage = {
      getItem: vi.fn((key: string) => {
        if (key === 'awawda.agent.access-token') {
          return 'web-token'
        }

        if (key === 'awawda.agent.profile') {
          return JSON.stringify(profile)
        }

        return null
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    vi.stubGlobal('localStorage', webStorage)

    const { readSessionToken, readSessionProfile, persistSessionToken, clearSessionToken } =
      await loadSessionStorageModule('web')

    await expect(readSessionToken()).resolves.toBe('web-token')
    await expect(readSessionProfile()).resolves.toEqual(profile)
    await persistSessionToken('new-token', profile)
    await clearSessionToken()

    expect(webStorage.getItem).toHaveBeenCalledWith('awawda.agent.access-token')
    expect(webStorage.getItem).toHaveBeenCalledWith('awawda.agent.profile')
    expect(webStorage.setItem).toHaveBeenCalledWith('awawda.agent.access-token', 'new-token')
    expect(webStorage.setItem).toHaveBeenCalledWith('awawda.agent.profile', JSON.stringify(profile))
    expect(webStorage.removeItem).toHaveBeenCalledWith('awawda.agent.access-token')
    expect(webStorage.removeItem).toHaveBeenCalledWith('awawda.agent.profile')

    expect(secureStoreMock.getItemAsync).not.toHaveBeenCalled()
    expect(secureStoreMock.setItemAsync).not.toHaveBeenCalled()
    expect(secureStoreMock.deleteItemAsync).not.toHaveBeenCalled()
  })

  it('uses SecureStore on native platforms', async () => {
    const profile = {
      id: 'agent-2',
      name: 'Agent Two',
      phone: '0500000001',
      email: null,
      role: 'supervisor',
    } as const
    secureStoreMock.getItemAsync.mockImplementation((key: string) =>
      Promise.resolve(
        key === 'awawda.agent.access-token'
          ? 'native-token'
          : key === 'awawda.agent.profile'
            ? JSON.stringify(profile)
            : null,
      ),
    )
    const { readSessionToken, readSessionProfile, persistSessionToken, clearSessionToken } =
      await loadSessionStorageModule('ios')

    await expect(readSessionToken()).resolves.toBe('native-token')
    await expect(readSessionProfile()).resolves.toEqual(profile)
    await persistSessionToken('native-next-token', profile)
    await clearSessionToken()

    expect(secureStoreMock.getItemAsync).toHaveBeenCalledWith('awawda.agent.access-token')
    expect(secureStoreMock.getItemAsync).toHaveBeenCalledWith('awawda.agent.profile')
    expect(secureStoreMock.setItemAsync).toHaveBeenCalledWith('awawda.agent.access-token', 'native-next-token')
    expect(secureStoreMock.setItemAsync).toHaveBeenCalledWith('awawda.agent.profile', JSON.stringify(profile))
    expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith('awawda.agent.access-token')
    expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith('awawda.agent.profile')
  })

  describe('refresh token storage', () => {
    it('readRefreshToken returns null when not stored (native)', async () => {
      secureStoreMock.getItemAsync.mockResolvedValue(null)
      const { readRefreshToken } = await loadSessionStorageModule('ios')
      await expect(readRefreshToken()).resolves.toBeNull()
    })

    it('readRefreshToken returns stored value (native)', async () => {
      secureStoreMock.getItemAsync.mockImplementation((key: string) =>
        Promise.resolve(key === 'awawda.agent.refresh-token' ? 'refresh-abc' : null),
      )
      const { readRefreshToken } = await loadSessionStorageModule('ios')
      await expect(readRefreshToken()).resolves.toBe('refresh-abc')
    })

    it('readRefreshToken returns null when not stored (web)', async () => {
      const webStorage = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() }
      vi.stubGlobal('localStorage', webStorage)
      const { readRefreshToken } = await loadSessionStorageModule('web')
      await expect(readRefreshToken()).resolves.toBeNull()
    })

    it('readRefreshToken returns stored value (web)', async () => {
      const webStorage = {
        getItem: vi.fn((key: string) =>
          key === 'awawda.agent.refresh-token' ? 'refresh-web-456' : null,
        ),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      }
      vi.stubGlobal('localStorage', webStorage)
      const { readRefreshToken } = await loadSessionStorageModule('web')
      await expect(readRefreshToken()).resolves.toBe('refresh-web-456')
    })
  })

  describe('access token expiry storage', () => {
    it('readAccessExpiresAt returns null when not stored', async () => {
      secureStoreMock.getItemAsync.mockResolvedValue(null)
      const { readAccessExpiresAt } = await loadSessionStorageModule('ios')
      await expect(readAccessExpiresAt()).resolves.toBeNull()
    })

    it('readAccessExpiresAt returns numeric value when stored', async () => {
      secureStoreMock.getItemAsync.mockImplementation((key: string) =>
        Promise.resolve(key === 'awawda.agent.access-expires-at' ? '1746700000000' : null),
      )
      const { readAccessExpiresAt } = await loadSessionStorageModule('ios')
      await expect(readAccessExpiresAt()).resolves.toBe(1746700000000)
    })

    it('readAccessExpiresAt returns null for corrupted non-numeric data', async () => {
      secureStoreMock.getItemAsync.mockImplementation((key: string) =>
        Promise.resolve(key === 'awawda.agent.access-expires-at' ? 'not-a-number' : null),
      )
      const { readAccessExpiresAt } = await loadSessionStorageModule('ios')
      await expect(readAccessExpiresAt()).resolves.toBeNull()
    })
  })

  describe('persistTokensOnly', () => {
    it('saves access token, refresh token, and expiry on native', async () => {
      const { persistTokensOnly } = await loadSessionStorageModule('ios')
      await persistTokensOnly('access-xyz', 'refresh-xyz', 1746700000000)

      expect(secureStoreMock.setItemAsync).toHaveBeenCalledWith('awawda.agent.access-token', 'access-xyz')
      expect(secureStoreMock.setItemAsync).toHaveBeenCalledWith('awawda.agent.refresh-token', 'refresh-xyz')
      expect(secureStoreMock.setItemAsync).toHaveBeenCalledWith('awawda.agent.access-expires-at', '1746700000000')
    })

    it('saves all three values on web', async () => {
      const webStorage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
      vi.stubGlobal('localStorage', webStorage)
      const { persistTokensOnly } = await loadSessionStorageModule('web')
      await persistTokensOnly('access-web', 'refresh-web', 1746700000000)

      expect(webStorage.setItem).toHaveBeenCalledWith('awawda.agent.access-token', 'access-web')
      expect(webStorage.setItem).toHaveBeenCalledWith('awawda.agent.refresh-token', 'refresh-web')
      expect(webStorage.setItem).toHaveBeenCalledWith('awawda.agent.access-expires-at', '1746700000000')
    })
  })

  describe('clearSessionToken', () => {
    it('clears access token, profile, refresh token and expiry on native', async () => {
      const { clearSessionToken } = await loadSessionStorageModule('ios')
      await clearSessionToken()

      expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith('awawda.agent.access-token')
      expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith('awawda.agent.profile')
      expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith('awawda.agent.refresh-token')
      expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith('awawda.agent.access-expires-at')
    })

    it('clears all four keys on web', async () => {
      const webStorage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
      vi.stubGlobal('localStorage', webStorage)
      const { clearSessionToken } = await loadSessionStorageModule('web')
      await clearSessionToken()

      expect(webStorage.removeItem).toHaveBeenCalledWith('awawda.agent.access-token')
      expect(webStorage.removeItem).toHaveBeenCalledWith('awawda.agent.profile')
      expect(webStorage.removeItem).toHaveBeenCalledWith('awawda.agent.refresh-token')
      expect(webStorage.removeItem).toHaveBeenCalledWith('awawda.agent.access-expires-at')
    })
  })
})
