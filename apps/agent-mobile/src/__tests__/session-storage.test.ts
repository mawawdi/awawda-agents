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
})
