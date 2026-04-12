import { API_BASE_URL } from '../config/env'

const LOCAL_FALLBACK_BASE_URLS = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://10.0.2.2:3000'] as const
const LOCAL_HOSTNAME_PATTERN = /^localhost$|^127\.0\.0\.1$|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./

export type FetchWithFallbackOptions = {
  requestLabel: string
  timeoutMs?: number
}

export function buildCandidateBaseUrls(baseUrl: string): string[] {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const candidates = [normalizedBaseUrl]

  if (!isLocalLikeBaseUrl(normalizedBaseUrl)) {
    return candidates
  }

  const runtimeHosts = resolveRuntimeLocalHosts()
  for (const host of runtimeHosts) {
    const candidate = `http://${host}:3000`
    if (!candidates.includes(candidate)) {
      candidates.push(candidate)
    }
  }

  for (const fallback of LOCAL_FALLBACK_BASE_URLS) {
    if (!candidates.includes(fallback)) {
      candidates.push(fallback)
    }
  }

  return candidates
}

export async function fetchWithBaseUrlFallback(
  path: string,
  init: RequestInit,
  options: FetchWithFallbackOptions,
): Promise<{ response: Response; checkedBaseUrls: string[] }> {
  const candidateBaseUrls = buildCandidateBaseUrls(API_BASE_URL)
  const checkedBaseUrls: string[] = []

  for (const candidateBaseUrl of candidateBaseUrls) {
    checkedBaseUrls.push(candidateBaseUrl)
    try {
      const response = await fetchWithTimeout(`${candidateBaseUrl}${path}`, init, options.timeoutMs)
      return { response, checkedBaseUrls }
    } catch {
      continue
    }
  }

  throw new Error(
    `לא ניתן להגיע אל ${options.requestLabel}. נבדקו הכתובות: ${checkedBaseUrls.join(', ')}. עדכנו את EXPO_PUBLIC_API_BASE_URL.`,
  )
}

function isLocalLikeBaseUrl(baseUrl: string): boolean {
  try {
    const hostname = normalizeHost(new URL(baseUrl).hostname)
    return LOCAL_HOSTNAME_PATTERN.test(hostname)
  } catch {
    return false
  }
}

function resolveRuntimeLocalHosts(): string[] {
  const hosts = new Set<string>()

  const explicitExpoGoHost = process.env.EXPO_PUBLIC_EXPO_GO_HOST?.trim()
  if (explicitExpoGoHost) {
    const normalized = normalizeHost(extractHostCandidate(explicitExpoGoHost))
    if (normalized) {
      hosts.add(normalized)
    }
  }

  try {
    const reactNative = require('react-native') as {
      NativeModules?: {
        SourceCode?: { scriptURL?: string }
        PlatformConstants?: { ServerHost?: string }
        DevSettings?: { bundleURL?: string }
      }
    }

    const runtimeHostCandidates = [
      reactNative.NativeModules?.SourceCode?.scriptURL,
      reactNative.NativeModules?.PlatformConstants?.ServerHost,
      reactNative.NativeModules?.DevSettings?.bundleURL,
    ]

    for (const candidate of runtimeHostCandidates) {
      if (!candidate || typeof candidate !== 'string') {
        continue
      }

      const host = normalizeHost(extractHostCandidate(candidate))
      if (!host || host === 'localhost' || host === '127.0.0.1') {
        continue
      }

      hosts.add(host)
    }
  } catch {
    // noop: native runtime modules are unavailable in some test environments.
  }

  return [...hosts]
}

function extractHostCandidate(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  try {
    return new URL(trimmed).hostname
  } catch {
    const withoutProtocol = trimmed.replace(/^https?:\/\//i, '')
    return withoutProtocol.split('/')[0]?.split(':')[0] ?? ''
  }
}

function normalizeHost(host: string): string {
  if (host === '10.0.0.2.2') {
    return '10.0.2.2'
  }

  return host.trim()
}

function normalizeBaseUrl(baseUrl: string): string {
  const correctedBaseUrl = baseUrl.replace('10.0.0.2.2', '10.0.2.2')

  try {
    const parsed = new URL(correctedBaseUrl)
    const normalizedHost = normalizeHost(parsed.hostname)
    parsed.hostname = normalizedHost
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return correctedBaseUrl.replace(/\/$/, '')
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs?: number): Promise<Response> {
  const timeout = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : null
  if (timeout === null) {
    return fetch(url, init)
  }

  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), timeout)

  try {
    return await fetch(url, {
      ...init,
      signal: abortController.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}
