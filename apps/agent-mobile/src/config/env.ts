const requiredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim()

if (!requiredApiBaseUrl) {
  throw new Error('EXPO_PUBLIC_API_BASE_URL must be configured for agent-mobile')
}

export const API_BASE_URL = requiredApiBaseUrl.replace(/\/$/, '')
