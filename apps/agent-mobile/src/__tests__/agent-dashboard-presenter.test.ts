import { describe, expect, it } from 'vitest'

import {
  applyApprovedCountMutation,
  formatLastOrderLabel,
  getResilienceHint,
  mergeApprovedItems,
} from '../screens/agent-dashboard-presenter'

describe('agent dashboard presenter', () => {
  it('formats assigned customer metadata for dashboard rendering', () => {
    expect(formatLastOrderLabel('2026-04-06T18:45:00.000Z')).toContain('Last order')
    expect(formatLastOrderLabel(null)).toBe('No recent order')
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
    expect(getResilienceHint(false, 'Unable to load assigned customers.')).toBe(
      'Unable to load assigned customers.',
    )
    expect(getResilienceHint(true, null)).toContain('Network is slower than usual')
    expect(getResilienceHint(false, null)).toBeNull()
  })
})
