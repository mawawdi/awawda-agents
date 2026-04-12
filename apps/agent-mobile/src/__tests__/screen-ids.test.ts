import { describe, expect, it } from 'vitest'

import { AGENT_SCREEN_TEST_IDS } from '../screens/agent-screen-ids'

describe('agent screen id mapping', () => {
  it('maps every meatland agent scenario to a concrete test id', () => {
    expect(AGENT_SCREEN_TEST_IDS).toEqual({
      dashboard: 'screen-agent-dashboard',
      customersList: 'screen-agent-customers-list',
      customerDetail: 'screen-agent-customer-detail',
      approvedCatalog: 'screen-agent-approved-catalog',
      ordersList: 'screen-agent-orders-list',
      settingsSync: 'screen-agent-settings-sync',
    })
  })
})

