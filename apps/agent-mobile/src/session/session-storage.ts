import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

import { AGENT_PROFILE_SCHEMA, type AgentProfile } from '../auth/contracts'

const SESSION_TOKEN_KEY = 'awawda.agent.access-token'
const SESSION_PROFILE_KEY = 'awawda.agent.profile'
const SESSION_REFRESH_TOKEN_KEY = 'awawda.agent.refresh-token'
const SESSION_ACCESS_EXPIRES_AT_KEY = 'awawda.agent.access-expires-at'
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

export async function readRefreshToken(): Promise<string | null> {
  const webStorage = getWebStorage()
  if (webStorage) {
    return webStorage.getItem(SESSION_REFRESH_TOKEN_KEY)
  }
  return SecureStore.getItemAsync(SESSION_REFRESH_TOKEN_KEY)
}

export async function readAccessExpiresAt(): Promise<number | null> {
  const webStorage = getWebStorage()
  const raw = webStorage
    ? webStorage.getItem(SESSION_ACCESS_EXPIRES_AT_KEY)
    : await SecureStore.getItemAsync(SESSION_ACCESS_EXPIRES_AT_KEY)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export async function persistSessionToken(
  accessToken: string,
  profile: AgentProfile | null = null,
  refreshToken?: string,
  accessExpiresAt?: number,
): Promise<void> {
  const webStorage = getWebStorage()
  if (webStorage) {
    webStorage.setItem(SESSION_TOKEN_KEY, accessToken)
    if (profile) {
      webStorage.setItem(SESSION_PROFILE_KEY, JSON.stringify(profile))
    } else {
      webStorage.removeItem(SESSION_PROFILE_KEY)
    }
    if (refreshToken) {
      webStorage.setItem(SESSION_REFRESH_TOKEN_KEY, refreshToken)
    }
    if (accessExpiresAt !== undefined) {
      webStorage.setItem(SESSION_ACCESS_EXPIRES_AT_KEY, String(accessExpiresAt))
    }
    return
  }

  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, accessToken)
  if (profile) {
    await SecureStore.setItemAsync(SESSION_PROFILE_KEY, JSON.stringify(profile))
  } else {
    await SecureStore.deleteItemAsync(SESSION_PROFILE_KEY)
  }
  if (refreshToken) {
    await SecureStore.setItemAsync(SESSION_REFRESH_TOKEN_KEY, refreshToken)
  }
  if (accessExpiresAt !== undefined) {
    await SecureStore.setItemAsync(SESSION_ACCESS_EXPIRES_AT_KEY, String(accessExpiresAt))
  }
}

export async function persistTokensOnly(
  accessToken: string,
  refreshToken: string,
  accessExpiresAt: number,
): Promise<void> {
  const webStorage = getWebStorage()
  if (webStorage) {
    webStorage.setItem(SESSION_TOKEN_KEY, accessToken)
    webStorage.setItem(SESSION_REFRESH_TOKEN_KEY, refreshToken)
    webStorage.setItem(SESSION_ACCESS_EXPIRES_AT_KEY, String(accessExpiresAt))
    return
  }
  await Promise.all([
    SecureStore.setItemAsync(SESSION_TOKEN_KEY, accessToken),
    SecureStore.setItemAsync(SESSION_REFRESH_TOKEN_KEY, refreshToken),
    SecureStore.setItemAsync(SESSION_ACCESS_EXPIRES_AT_KEY, String(accessExpiresAt)),
  ])
}

export async function clearSessionToken(): Promise<void> {
  const webStorage = getWebStorage()
  if (webStorage) {
    webStorage.removeItem(SESSION_TOKEN_KEY)
    webStorage.removeItem(SESSION_PROFILE_KEY)
    webStorage.removeItem(SESSION_REFRESH_TOKEN_KEY)
    webStorage.removeItem(SESSION_ACCESS_EXPIRES_AT_KEY)
    return
  }

  await Promise.all([
    SecureStore.deleteItemAsync(SESSION_TOKEN_KEY),
    SecureStore.deleteItemAsync(SESSION_PROFILE_KEY),
    SecureStore.deleteItemAsync(SESSION_REFRESH_TOKEN_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(SESSION_ACCESS_EXPIRES_AT_KEY).catch(() => undefined),
  ])
}
