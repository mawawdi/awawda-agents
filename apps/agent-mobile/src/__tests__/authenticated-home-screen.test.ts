import { describe, expect, it } from 'vitest'

import { getCurrentTimeLabel, placeholderImageUri } from '../screens/authenticated-home-screen.helpers'

describe('authenticated home screen helpers', () => {
  it('formats dashboard freshness label from current time instead of a hardcoded value', () => {
    const morning = getCurrentTimeLabel(new Date('2026-04-12T08:05:00.000Z'))
    const evening = getCurrentTimeLabel(new Date('2026-04-12T20:45:00.000Z'))

    expect(morning).toMatch(/\d{2}:\d{2}/)
    expect(evening).toMatch(/\d{2}:\d{2}/)
    expect(morning).not.toBe(evening)
  })

  it('uses local data URI placeholders and never third-party picsum seeds', () => {
    const uri = placeholderImageUri('cust-internal-42', 320, 180)

    expect(uri.startsWith('data:image/svg+xml;utf8,')).toBe(true)
    expect(uri).not.toContain('picsum.photos')
    expect(uri).not.toContain('cust-internal-42')
  })
})
