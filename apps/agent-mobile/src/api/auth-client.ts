import { API_BASE_URL } from '../config/env'
import { LOGIN_RESPONSE_SCHEMA, type LoginInput, type LoginResponse } from '../auth/contracts'

const LOGIN_TIMEOUT_MS = 8000
const LOCAL_FALLBACK_BASE_URLS = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://10.0.2.2:3000'] as const

class SignInConnectivityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignInConnectivityError'
  }
}

function parseErrorBody(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidate = (payload as { message?: unknown }).message
  return typeof candidate === 'string' && candidate.trim() ? candidate : null
}

function isLocalLikeBaseUrl(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl).hostname
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    )
  } catch {
    return false
  }
}

function buildCandidateBaseUrls(baseUrl: string): string[] {
  const candidates = [baseUrl]
  if (isLocalLikeBaseUrl(baseUrl)) {
    const expoGoHostFallback = resolveExpoGoHostFallbackUrl()
    if (expoGoHostFallback && !candidates.includes(expoGoHostFallback)) {
      candidates.push(expoGoHostFallback)
    }
    for (const fallback of LOCAL_FALLBACK_BASE_URLS) {
      if (!candidates.includes(fallback)) {
        candidates.push(fallback)
      }
    }
  }
  return candidates
}

function resolveExpoGoHostFallbackUrl(): string | null {
  const explicitExpoGoHost = process.env.EXPO_PUBLIC_EXPO_GO_HOST?.trim()
  if (explicitExpoGoHost) {
    const normalizedHost = explicitExpoGoHost
      .replace(/^https?:\/\//i, '')
      .replace(/:\d+$/, '')
      .trim()
    if (normalizedHost.length > 0) {
      return `http://${normalizedHost}:3000`
    }
  }

  try {
    const reactNative = require('react-native') as {
      NativeModules?: {
        SourceCode?: {
          scriptURL?: string
        }
      }
    }

    const scriptUrl = reactNative.NativeModules?.SourceCode?.scriptURL
    if (!scriptUrl || typeof scriptUrl !== 'string') {
      return null
    }

    const host = new URL(scriptUrl).hostname
    if (!host || host === 'localhost' || host === '127.0.0.1') {
      return null
    }

    return `http://${host}:3000`
  } catch {
    return null
  }
}

async function requestLogin(baseUrl: string, input: LoginInput): Promise<Response> {
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), LOGIN_TIMEOUT_MS)

  try {
    return await fetch(`${baseUrl}/v1/agent/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
      signal: abortController.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new SignInConnectivityError(`Sign-in timed out for ${baseUrl}.`)
    }
    throw new SignInConnectivityError(`Cannot reach sign-in server at ${baseUrl}.`)
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function loginAgent(input: LoginInput): Promise<LoginResponse> {
  if (/YOUR_LAN_IP/i.test(API_BASE_URL)) {
    throw new Error('API base URL is not configured. Set EXPO_PUBLIC_API_BASE_URL in apps/agent-mobile/.env.')
  }

  const candidateBaseUrls = buildCandidateBaseUrls(API_BASE_URL)
  let response: Response | null = null

  for (const candidateBaseUrl of candidateBaseUrls) {
    try {
      response = await requestLogin(candidateBaseUrl, input)
      break
    } catch (error) {
      if (error instanceof SignInConnectivityError) {
        continue
      }
      throw error
    }
  }

  if (!response) {
    throw new Error(
      `Cannot reach sign-in server. Checked: ${candidateBaseUrls.join(', ')}. Update EXPO_PUBLIC_API_BASE_URL.`,
    )
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      parseErrorBody(payload) ??
        (response.status === 401
          ? 'Invalid phone/email or password.'
          : 'Unable to sign in right now. Please try again.'),
    )
  }

  const parsed = LOGIN_RESPONSE_SCHEMA.safeParse(payload)

  if (!parsed.success) {
    throw new Error('Unexpected response from server.')
  }

  return parsed.data
}
