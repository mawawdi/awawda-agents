import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const SESSION_TOKEN_KEY = 'meatland.agent.access-token'
const IS_WEB = Platform.OS === 'web'

function getWebStorage(): Storage | null {
  if (!IS_WEB || typeof globalThis.localStorage === 'undefined') {
    return null
  }

  return globalThis.localStorage
}

export async function readSessionToken(): Promise<string | null> {
  const webStorage = getWebStorage()
  if (webStorage) {
    return webStorage.getItem(SESSION_TOKEN_KEY)
  }

  return SecureStore.getItemAsync(SESSION_TOKEN_KEY)
}

export async function persistSessionToken(accessToken: string): Promise<void> {
  const webStorage = getWebStorage()
  if (webStorage) {
    webStorage.setItem(SESSION_TOKEN_KEY, accessToken)
    return
  }

  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, accessToken)
}

export async function clearSessionToken(): Promise<void> {
  const webStorage = getWebStorage()
  if (webStorage) {
    webStorage.removeItem(SESSION_TOKEN_KEY)
    return
  }

  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY)
}
