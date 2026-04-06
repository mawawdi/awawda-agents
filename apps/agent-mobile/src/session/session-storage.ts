import * as SecureStore from 'expo-secure-store'

const SESSION_TOKEN_KEY = 'meatland.agent.access-token'

export async function readSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY)
}

export async function persistSessionToken(accessToken: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, accessToken)
}

export async function clearSessionToken(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY)
}
