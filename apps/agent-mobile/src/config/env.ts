const DEFAULT_LOCAL_API_BASE_URL = 'http://localhost:3000'
const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim()

function resolveApiBaseUrl(): string {
  if (!rawApiBaseUrl) {
    return DEFAULT_LOCAL_API_BASE_URL
  }

  if (/^auto$/i.test(rawApiBaseUrl) || /YOUR_LAN_IP/i.test(rawApiBaseUrl)) {
    return DEFAULT_LOCAL_API_BASE_URL
  }

  return rawApiBaseUrl.replace(/\/$/, '')
}

export const API_BASE_URL = resolveApiBaseUrl()
