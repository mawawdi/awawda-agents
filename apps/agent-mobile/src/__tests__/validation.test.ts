import { describe, expect, it } from 'vitest'

import { validateLoginInput } from '../auth/validation'

describe('validateLoginInput', () => {
  it('returns helpful messages for missing phone/email and short password', () => {
    const result = validateLoginInput({ phoneOrEmail: ' ', password: '123' })

    expect(result.phoneOrEmail).toBe('Enter your phone number or email.')
    expect(result.password).toBe('Password must contain at least 8 characters.')
  })

  it('returns no errors for valid values', () => {
    const result = validateLoginInput({ phoneOrEmail: 'agent@meatland.test', password: 'strongpass123' })

    expect(result).toEqual({})
  })
})
