import { describe, expect, it } from 'vitest'

import { validateLoginInput } from '../auth/validation'

describe('validateLoginInput', () => {
  it('returns helpful messages for invalid email and short password', () => {
    const result = validateLoginInput({ email: 'bad-email', password: '123' })

    expect(result.email).toBe('Enter a valid email address.')
    expect(result.password).toBe('Password must contain at least 8 characters.')
  })

  it('returns no errors for valid values', () => {
    const result = validateLoginInput({ email: 'agent@meatland.test', password: 'strongpass123' })

    expect(result).toEqual({})
  })
})
