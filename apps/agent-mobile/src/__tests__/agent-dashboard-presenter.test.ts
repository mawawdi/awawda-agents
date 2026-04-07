import { describe, expect, it } from 'vitest'

import {
  applyApprovedCountMutation,
  buildMagicLinkShareMessage,
  buildWhatsAppDeepLink,
  formatMagicLinkExpiry,
  formatLastOrderLabel,
  getResilienceHint,
  mergeApprovedItems,
  normalizeMagicLinkForShare,
  shouldUseCopyLinkFallback,
} from '../screens/agent-dashboard-presenter'

describe('agent dashboard presenter', () => {
  it('formats assigned customer metadata for dashboard rendering', () => {
    expect(formatLastOrderLabel('2026-04-06T18:45:00.000Z')).toContain('הזמנה אחרונה')
    expect(formatLastOrderLabel(null)).toBe('ללא הזמנה קודמת')
  })

  it('merges add-item mutation for deterministic approved-item rendering', () => {
    const merged = mergeApprovedItems(
      [
        {
          hashItemId: 'itm-11',
          addedByAgentId: 'agent-7',
          createdAt: '2026-04-05T10:00:00.000Z',
        },
        {
          hashItemId: 'itm-12',
          addedByAgentId: 'agent-42',
          createdAt: '2026-04-06T10:00:00.000Z',
        },
      ],
      {
        customerId: 'cust-alpha',
        created: true,
        item: {
          hashItemId: 'itm-11',
          addedByAgentId: 'agent-42',
          createdAt: '2026-04-06T19:00:00.000Z',
        },
      },
    )

    expect(merged).toEqual([
      {
        hashItemId: 'itm-11',
        addedByAgentId: 'agent-42',
        createdAt: '2026-04-06T19:00:00.000Z',
      },
      {
        hashItemId: 'itm-12',
        addedByAgentId: 'agent-42',
        createdAt: '2026-04-06T10:00:00.000Z',
      },
    ])

    expect(
      applyApprovedCountMutation(
        [
          { customerId: 'cust-alpha', approvedItemsCount: 1, lastOrderAt: null },
          { customerId: 'cust-beta', approvedItemsCount: 4, lastOrderAt: null },
        ],
        'cust-alpha',
        true,
      ),
    ).toEqual([
      { customerId: 'cust-alpha', approvedItemsCount: 2, lastOrderAt: null },
      { customerId: 'cust-beta', approvedItemsCount: 4, lastOrderAt: null },
    ])
  })

  it('prioritizes resilience messaging for failures and slow-network hints', () => {
    expect(getResilienceHint(false, 'לא הצלחנו לטעון לקוחות משויכים.')).toBe(
      'לא הצלחנו לטעון לקוחות משויכים.',
    )
    expect(getResilienceHint(true, null)).toContain('הרשת איטית מהרגיל')
    expect(getResilienceHint(false, null)).toBeNull()
  })

  it('builds WhatsApp deep-link sharing payload for generated links', () => {
    const shareMessage = buildMagicLinkShareMessage('cust-alpha', {
      linkUrl: 'https://portal.example.test/m?token=abc123',
      expiresAt: '2026-04-07T11:30:00.000Z',
      expiresInSeconds: 5400,
      lifecycle: 'issued',
    })

    expect(shareMessage).toContain('cust-alpha')
    expect(shareMessage).toContain('https://portal.example.test/m?token=abc123')

    const deepLink = buildWhatsAppDeepLink(shareMessage)
    expect(deepLink).toContain('whatsapp://send?text=')
    expect(decodeURIComponent(deepLink.split('text=')[1] ?? '')).toContain('קישור ההזמנה שלך')
  })

  it('normalizes localhost https links to http before sharing', () => {
    const payload = normalizeMagicLinkForShare({
      linkUrl: 'https://localhost:8080/m?token=abc123',
      expiresAt: '2026-04-07T11:30:00.000Z',
      expiresInSeconds: 5400,
      lifecycle: 'issued',
    })

    expect(payload.linkUrl).toBe('http://localhost:8080/m?token=abc123')

    const shareMessage = buildMagicLinkShareMessage('cust-alpha', payload)
    expect(shareMessage).toContain('http://localhost:8080/m?token=abc123')
  })

  it('renders expiry metadata with graceful fallback for invalid backend timestamps', () => {
    expect(formatMagicLinkExpiry('2026-04-07T11:30:00.000Z')).not.toBe('מועד תפוגה לא זמין')
    expect(formatMagicLinkExpiry('not-a-date')).toBe('מועד תפוגה לא זמין')
  })

  it('flags copy-link fallback when WhatsApp cannot launch or dispatch throws', () => {
    expect(shouldUseCopyLinkFallback(false)).toBe(true)
    expect(shouldUseCopyLinkFallback(true, new Error('cannot open app'))).toBe(true)
    expect(shouldUseCopyLinkFallback(true)).toBe(false)
  })
})
