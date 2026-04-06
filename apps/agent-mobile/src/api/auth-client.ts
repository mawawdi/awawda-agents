import { API_BASE_URL } from '../config/env'
import { LOGIN_RESPONSE_SCHEMA, type LoginInput, type LoginResponse } from '../auth/contracts'

function parseErrorBody(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidate = (payload as { message?: unknown }).message
  return typeof candidate === 'string' && candidate.trim() ? candidate : null
}

export async function loginAgent(input: LoginInput): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/v1/agent/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  })

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
