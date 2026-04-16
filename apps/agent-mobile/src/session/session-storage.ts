import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

import { AGENT_PROFILE_SCHEMA, type AgentProfile } from '../auth/contracts'

const SESSION_TOKEN_KEY = 'awawda.agent.access-token'
const SESSION_PROFILE_KEY = 'awawda.agent.profile'
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

export async function readSessionProfile(): Promise<AgentProfile | null> {
  const webStorage = getWebStorage()
  const serializedProfile = webStorage
    ? webStorage.getItem(SESSION_PROFILE_KEY)
    : await SecureStore.getItemAsync(SESSION_PROFILE_KEY)

  if (!serializedProfile) {
    return null
  }

  try {
    const parsedProfile = JSON.parse(serializedProfile)
    const result = AGENT_PROFILE_SCHEMA.safeParse(parsedProfile)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export async function persistSessionToken(
  accessToken: string,
  profile: AgentProfile | null = null,
): Promise<void> {
  const webStorage = getWebStorage()
  if (webStorage) {
    webStorage.setItem(SESSION_TOKEN_KEY, accessToken)
    if (profile) {
      webStorage.setItem(SESSION_PROFILE_KEY, JSON.stringify(profile))
    } else {
      webStorage.removeItem(SESSION_PROFILE_KEY)
    }
    return
  }

  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, accessToken)
  if (profile) {
    await SecureStore.setItemAsync(SESSION_PROFILE_KEY, JSON.stringify(profile))
  } else {
    await SecureStore.deleteItemAsync(SESSION_PROFILE_KEY)
  }
}

export async function clearSessionToken(): Promise<void> {
  const webStorage = getWebStorage()
  if (webStorage) {
    webStorage.removeItem(SESSION_TOKEN_KEY)
    webStorage.removeItem(SESSION_PROFILE_KEY)
    return
  }

  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY)
  await SecureStore.deleteItemAsync(SESSION_PROFILE_KEY)
}
