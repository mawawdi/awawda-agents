import { describe, expect, it } from 'vitest'

import { touchTarget } from '../theme/tokens'

describe('mobile touch target policy', () => {
  it('keeps minimum actionable targets at WCAG-friendly sizes', () => {
    expect(touchTarget.min).toBeGreaterThanOrEqual(44)
    expect(touchTarget.comfortable).toBeGreaterThanOrEqual(touchTarget.min)
  })
})
