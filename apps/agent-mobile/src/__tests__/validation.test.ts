import { describe, expect, it } from 'vitest'

import { validateLoginInput } from '../auth/validation'

describe('validateLoginInput', () => {
  it('returns helpful messages for missing phone/email and short password', () => {
    const result = validateLoginInput({ phoneOrEmail: ' ', password: '123' })

    expect(result.phoneOrEmail).toBe('הזינו מספר טלפון או דוא״ל.')
    expect(result.password).toBe('הסיסמה חייבת להכיל לפחות 8 תווים.')
  })

  it('returns no errors for valid values', () => {
    const result = validateLoginInput({ phoneOrEmail: 'agent@awawda.test', password: 'strongpass123' })

    expect(result).toEqual({})
  })
})
