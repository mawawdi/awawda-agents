import { API_BASE_URL } from '../config/env'

const LOCAL_FALLBACK_HOSTS = ['localhost', '127.0.0.1', '10.0.2.2'] as const
const LOCAL_HOSTNAME_PATTERN = /^localhost$|^127\.0\.0\.1$|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./
const API_ROUTE_MISMATCH_PATTERN = /^Cannot (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+\/v1\//

export type FetchWithFallbackOptions = {
  requestLabel: string
  timeoutMs?: number
}

export function buildCandidateBaseUrls(baseUrl: string): string[] {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const localBaseTemplate = parseLocalBaseTemplate(normalizedBaseUrl)
  const candidates: string[] = []
  const pushCandidate = (candidate: string): void => {
    if (candidate && !candidates.includes(candidate)) {
      candidates.push(candidate)
    }
  }

  pushCandidate(normalizedBaseUrl)

  if (!isLocalLikeBaseUrl(normalizedBaseUrl)) {
    return candidates
  }

  const runtimeHosts = resolveRuntimeLocalHosts()
  for (const host of runtimeHosts) {
    pushCandidate(buildBaseUrlFromTemplate(host, localBaseTemplate))
  }

  for (const fallbackHost of LOCAL_FALLBACK_HOSTS) {
    pushCandidate(buildBaseUrlFromTemplate(fallbackHost, localBaseTemplate))
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
  let routeMismatchDetected = false

  for (const candidateBaseUrl of candidateBaseUrls) {
    checkedBaseUrls.push(candidateBaseUrl)
    try {
      const response = await fetchWithTimeout(
        `${candidateBaseUrl}${path}`,
        createAttemptRequestInit(init),
        options.timeoutMs,
      )
      const routeMismatchMessage = await readApiRouteMismatchMessage(response)
      if (routeMismatchMessage) {
        routeMismatchDetected = true
        continue
      }
      return { response, checkedBaseUrls }
    } catch {
      continue
    }
  }

  if (routeMismatchDetected) {
    throw new Error(
      `נתיב ה-API לא תואם לשרת הפעיל. ודאו שה-API רץ עם גרסה עדכנית וש-EXPO_PUBLIC_API_BASE_URL מצביע לשרת הנכון. נבדקו הכתובות: ${checkedBaseUrls.join(', ')}`,
    )
  }

  throw new Error(
    `לא ניתן להגיע אל ${options.requestLabel}. נבדקו הכתובות: ${checkedBaseUrls.join(', ')}. עדכנו את EXPO_PUBLIC_API_BASE_URL או EXPO_PUBLIC_EXPO_GO_HOST.`,
  )
}

function createAttemptRequestInit(init: RequestInit): RequestInit {
  return {
    ...init,
    method: typeof init.method === 'string' && init.method.trim() ? init.method.trim().toUpperCase() : init.method,
    headers: cloneHeadersInit(init.headers),
  }
}

function cloneHeadersInit(headers: HeadersInit | undefined): HeadersInit | undefined {
  if (!headers) {
    return undefined
  }

  if (headers instanceof Headers) {
    return new Headers(headers)
  }

  if (Array.isArray(headers)) {
    return headers.map(([name, value]) => [name, value] as [string, string])
  }

  return { ...headers }
}

type LocalBaseTemplate = {
  protocol: 'http:' | 'https:'
  port: string
  pathname: string
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
    const expoConstantsModule = require('expo-constants') as {
      default?: Record<string, unknown>
    } & Record<string, unknown>
    const expoConstants = (expoConstantsModule.default ?? expoConstantsModule) as {
      expoConfig?: { hostUri?: string }
      manifest2?: { extra?: { expoClient?: { hostUri?: string } } }
      manifest?: { debuggerHost?: string }
    }

    const runtimeHostCandidates = [
      reactNative.NativeModules?.SourceCode?.scriptURL,
      reactNative.NativeModules?.PlatformConstants?.ServerHost,
      reactNative.NativeModules?.DevSettings?.bundleURL,
      expoConstants.expoConfig?.hostUri,
      expoConstants.manifest2?.extra?.expoClient?.hostUri,
      expoConstants.manifest?.debuggerHost,
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
    const withoutProtocol = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
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

function parseLocalBaseTemplate(baseUrl: string): LocalBaseTemplate {
  try {
    const parsed = new URL(baseUrl)
    const protocol = parsed.protocol === 'https:' ? 'https:' : 'http:'
    const port = parsed.port || (protocol === 'https:' ? '443' : '3000')
    const pathname = normalizeBasePath(parsed.pathname)
    return { protocol, port, pathname }
  } catch {
    return { protocol: 'http:', port: '3000', pathname: '' }
  }
}

function normalizeBasePath(pathname: string): string {
  if (!pathname || pathname === '/') {
    return ''
  }

  return pathname.replace(/\/+$/g, '')
}

function buildBaseUrlFromTemplate(host: string, template: LocalBaseTemplate): string {
  const normalizedHost = normalizeHost(host)
  if (!normalizedHost) {
    return ''
  }

  const portSegment = template.port ? `:${template.port}` : ''
  return `${template.protocol}//${normalizedHost}${portSegment}${template.pathname}`
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

async function readApiRouteMismatchMessage(response: Response): Promise<string | null> {
  if (response.status !== 404) {
    return null
  }

  try {
    const payload = (await response.clone().json()) as { message?: unknown }
    const message = typeof payload.message === 'string' ? payload.message.trim() : ''
    if (!API_ROUTE_MISMATCH_PATTERN.test(message)) {
      return null
    }

    return message
  } catch {
    return null
  }
}
