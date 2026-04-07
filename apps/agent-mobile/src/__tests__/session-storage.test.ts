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
    const webStorage = {
      getItem: vi.fn().mockReturnValue('web-token'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    vi.stubGlobal('localStorage', webStorage)

    const { readSessionToken, persistSessionToken, clearSessionToken } = await loadSessionStorageModule('web')

    await expect(readSessionToken()).resolves.toBe('web-token')
    await persistSessionToken('new-token')
    await clearSessionToken()

    expect(webStorage.getItem).toHaveBeenCalledWith('meatland.agent.access-token')
    expect(webStorage.setItem).toHaveBeenCalledWith('meatland.agent.access-token', 'new-token')
    expect(webStorage.removeItem).toHaveBeenCalledWith('meatland.agent.access-token')

    expect(secureStoreMock.getItemAsync).not.toHaveBeenCalled()
    expect(secureStoreMock.setItemAsync).not.toHaveBeenCalled()
    expect(secureStoreMock.deleteItemAsync).not.toHaveBeenCalled()
  })

  it('uses SecureStore on native platforms', async () => {
    secureStoreMock.getItemAsync.mockResolvedValue('native-token')
    const { readSessionToken, persistSessionToken, clearSessionToken } = await loadSessionStorageModule('ios')

    await expect(readSessionToken()).resolves.toBe('native-token')
    await persistSessionToken('native-next-token')
    await clearSessionToken()

    expect(secureStoreMock.getItemAsync).toHaveBeenCalledWith('meatland.agent.access-token')
    expect(secureStoreMock.setItemAsync).toHaveBeenCalledWith(
      'meatland.agent.access-token',
      'native-next-token',
    )
    expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith('meatland.agent.access-token')
  })
})
