import { describe, expect, it } from 'vitest'

import { getAuthFailureMessage } from '../auth/errors'

describe('getAuthFailureMessage', () => {
  it('surfaces error message when available', () => {
    expect(getAuthFailureMessage(new Error('Invalid email or password.'))).toBe('Invalid email or password.')
  })

  it('falls back to generic message for unknown errors', () => {
    expect(getAuthFailureMessage({})).toBe('Sign-in failed. Please try again.')
  })
})
