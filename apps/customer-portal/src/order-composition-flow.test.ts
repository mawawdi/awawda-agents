import { describe, expect, it } from 'vitest';

import {
  clearOrderSubmitting,
  createOrderErrorState,
  createOrderLoadingState,
  createOrderReadyState,
  decrementOrderLineQuantity,
  incrementOrderLineQuantity,
  markOrderLoadingWeakNetwork,
  markOrderSubmitting,
  setOrderLineQuantity,
} from './order-composition-flow';

describe('order composition interactions and UX states', () => {
  it('composes recent + approved sections and updates cart quantities', () => {
    const initial = createOrderReadyState({
      viewportWidthPx: 390,
      recentItems: [
        {
          itemId: 'item-1',
          name: 'Ribeye Steak',
          lastOrderedAt: '2026-04-07T10:00:00.000Z',
        },
      ],
      approvedItems: [
        {
          hashItemId: 'item-1',
          createdAt: '2026-04-06T09:00:00.000Z',
        },
        {
          hashItemId: 'item-2',
          createdAt: '2026-04-06T10:00:00.000Z',
        },
      ],
      pricing: [
        {
          itemId: 'item-1',
          unitPrice: 42.5,
          currency: 'ILS',
        },
      ],
    });

    expect(initial).toMatchObject({
      status: 'ready',
      layout: 'mobile',
      sections: {
        recent: { items: [{ itemId: 'item-1', quantity: 0 }] },
        approved: {
          items: [
            { itemId: 'item-1', quantity: 0 },
            { itemId: 'item-2', name: 'מוצר 2', quantity: 0 },
          ],
        },
      },
      cart: {
        lineCount: 0,
        estimatedTotal: 0,
      },
      submitBar: {
        visible: false,
      },
    });

    const withQty = setOrderLineQuantity(initial, 'item-1', 2.9);
    expect(withQty).toMatchObject({
      status: 'ready',
      cart: {
        lineCount: 1,
        totalUnits: 2,
        estimatedTotal: 85,
        unknownPriceLineCount: 0,
      },
      submitBar: {
        visible: true,
        submitEnabled: true,
        summaryLabel: 'סה"כ משוער ₪85.00',
        submitLabel: 'שליחת הזמנה למפעל (2 יחידות)',
      },
    });

    const incremented = incrementOrderLineQuantity(withQty, 'item-1');
    expect(incremented).toMatchObject({
      status: 'ready',
      cart: {
        totalUnits: 3,
        estimatedTotal: 127.5,
      },
    });

    const decremented = decrementOrderLineQuantity(incremented, 'item-1');
    expect(decremented).toMatchObject({
      status: 'ready',
      cart: {
        totalUnits: 2,
        estimatedTotal: 85,
      },
    });
  });

  it('captures loading/error weak-network and sticky-submit lock state', () => {
    const loading = createOrderLoadingState();
    expect(loading).toEqual({ status: 'loading', canRetry: false, weakNetworkHint: false });
    expect(markOrderLoadingWeakNetwork(loading)).toEqual({
      status: 'loading',
      canRetry: false,
      weakNetworkHint: true,
    });

    expect(createOrderErrorState('Failed to load portal data')).toEqual({
      status: 'error',
      canRetry: true,
      message: 'Failed to load portal data',
    });

    const ready = createOrderReadyState({
      viewportWidthPx: 360,
      recentItems: [
        {
          itemId: 'item-10',
          name: 'Ground Beef',
          lastOrderedAt: '2026-04-08T07:00:00.000Z',
        },
      ],
      approvedItems: [],
      pricing: [
        {
          itemId: 'item-10',
          unitPrice: 55,
          currency: 'ILS',
        },
      ],
      initialQuantities: {
        'item-10': 1,
      },
    });

    const submitting = markOrderSubmitting(ready);
    expect(submitting).toMatchObject({
      status: 'ready',
      layout: 'mobile',
      isSubmitting: true,
      submitBar: {
        visible: true,
        mobileOptimized: true,
        submitEnabled: false,
        submitLabel: 'שולחים הזמנה…',
      },
    });

    expect(clearOrderSubmitting(submitting)).toMatchObject({
      status: 'ready',
      isSubmitting: false,
      submitBar: {
        submitEnabled: true,
        submitLabel: 'שליחת הזמנה למפעל (1 יחידות)',
      },
    });
  });

  it('derives readable fallback names for approved-only items', () => {
    const ready = createOrderReadyState({
      recentItems: [],
      approvedItems: [
        { hashItemId: 'itm-frozen-burger', createdAt: '2026-04-08T09:00:00.000Z' },
        { hashItemId: 'item-45', createdAt: '2026-04-08T09:00:00.000Z' },
        { hashItemId: 'item-', createdAt: '2026-04-08T09:00:00.000Z' },
      ],
      pricing: [],
    });

    expect(ready).toMatchObject({
      status: 'ready',
      sections: {
        approved: {
          items: [
            { itemId: 'itm-frozen-burger', name: 'קפוא המבורגר' },
            { itemId: 'item-45', name: 'מוצר 45' },
            { itemId: 'item-', name: 'מוצר' },
          ],
        },
      },
    });
  });

  it('keeps unknown-price lines visible in summary when pricing is partially missing', () => {
    const ready = createOrderReadyState({
      viewportWidthPx: 1024,
      recentItems: [{ itemId: 'itm-1', name: 'Ribeye', lastOrderedAt: '2026-04-08T10:00:00.000Z' }],
      approvedItems: [{ hashItemId: 'itm-2', createdAt: '2026-04-08T10:00:00.000Z' }],
      pricing: [{ itemId: 'itm-1', unitPrice: 100, currency: 'ILS' }],
      initialQuantities: {
        'itm-1': 1,
        'itm-2': 2,
      },
    });

    expect(ready).toMatchObject({
      status: 'ready',
      layout: 'desktop',
      cart: {
        lineCount: 2,
        totalUnits: 3,
        estimatedTotal: 100,
        unknownPriceLineCount: 1,
      },
      submitBar: {
        visible: true,
        mobileOptimized: false,
        summaryLabel: 'לא ניתן לחשב סכום משוער עבור חלק מהפריטים',
      },
    });
  });
});
