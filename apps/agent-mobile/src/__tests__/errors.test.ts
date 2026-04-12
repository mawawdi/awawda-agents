import { describe, expect, it } from 'vitest'

import { getAuthFailureMessage } from '../auth/errors'

describe('getAuthFailureMessage', () => {
  it('surfaces error message when available', () => {
    expect(getAuthFailureMessage(new Error('טלפון/דוא״ל או סיסמה שגויים.'))).toBe(
      'טלפון/דוא״ל או סיסמה שגויים.',
    )
  })

  it('falls back to generic message for unknown errors', () => {
    expect(getAuthFailureMessage({})).toBe('ההתחברות נכשלה. נסו שוב.')
  })
})
