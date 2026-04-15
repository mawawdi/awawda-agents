import { LOGIN_RESPONSE_SCHEMA, type LoginInput, type LoginResponse } from '../auth/contracts'
import { fetchWithBaseUrlFallback } from './api-base-url-fallback'

const LOGIN_TIMEOUT_MS = 8000

function parseErrorBody(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidate = (payload as { message?: unknown }).message
  return typeof candidate === 'string' && candidate.trim() ? candidate : null
}

export async function loginAgent(input: LoginInput): Promise<LoginResponse> {
  const { response } = await fetchWithBaseUrlFallback(
    '/v1/agent/auth/login',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
    },
    {
      requestLabel: 'שרת ההתחברות',
      timeoutMs: LOGIN_TIMEOUT_MS,
    },
  )

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
          parseErrorBody(payload) ??
        (response.status === 401
          ? 'טלפון/דוא״ל או סיסמה שגויים.'
          : 'לא ניתן להתחבר כרגע. נסו שוב.'),
    )
  }

  const parsed = LOGIN_RESPONSE_SCHEMA.safeParse(payload)

  if (!parsed.success) {
    throw new Error('התקבלה תשובה לא צפויה מהשרת.')
  }

  return parsed.data
}
