import { describe, expect, it } from 'vitest';

import { PORTAL_SCREEN_TEST_IDS } from './portal-screen-ids';

describe('portal screen id mapping', () => {
  it('keeps awawda portal scenarios mapped to runtime render surfaces', () => {
    expect(PORTAL_SCREEN_TEST_IDS).toEqual({
      sessionError: 'screen-portal-session-error',
      orderComposer: 'screen-portal-order-composer',
      recentOrdersPanel: 'screen-portal-recent-orders',
      orderMismatch: 'screen-portal-order-mismatch',
      orderSuccess: 'screen-portal-order-success',
    });
  });
});
