// @vitest-environment jsdom

import type {
  CustomerOrderSubmitRequest,
  CustomerOrderSubmitResponse,
  CustomerPortalDataResponse,
  CustomerSessionActivateResponse,
} from '@awawda/shared-types';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CustomerPortalRoutes, __resetPortalSessionForTests, __setPortalSessionForTests } from './customer-portal-routes';
import { PortalApiError, type PortalApiClient } from './portal-api-client';

const activationResponse: CustomerSessionActivateResponse = {
  sessionToken: 'session-123',
  customer: { customerId: 'cust-1' },
  sessionExpiresAt: '2099-04-08T14:00:00.000Z',
  recentItems: [
    {
      itemId: 'item-1',
      name: 'אנטריקוט פרימיום',
      lastOrderedAt: '2026-04-07T10:00:00.000Z',
    },
  ],
  approvedItems: [
    {
      hashItemId: 'item-1',
      addedByAgentId: 'agent-9',
      createdAt: '2026-04-06T08:30:00.000Z',
    },
    {
      hashItemId: 'item-2',
      addedByAgentId: 'agent-9',
      createdAt: '2026-04-06T09:00:00.000Z',
    },
  ],
  pricing: [
    { itemId: 'item-1', unitPrice: 42.5, currency: 'ILS' },
    { itemId: 'item-2', unitPrice: 50, currency: 'ILS' },
  ],
  recentOrders: {
    entries: [
      {
        compositionSignature: 'signature-1',
        lines: [
          { itemId: 'item-1', itemName: 'אנטריקוט פרימיום', quantity: 2, unit: 'unit' },
          { itemId: 'item-2', itemName: 'מוצר 2', quantity: 1, unit: 'unit' },
        ],
        lastOrderedAt: '2026-04-08T11:00:00.000Z',
        orderCount: 4,
      },
      {
        compositionSignature: 'signature-2',
        lines: [{ itemId: 'item-2', itemName: 'מוצר 2', quantity: 3, unit: 'unit' }],
        lastOrderedAt: '2026-04-07T09:30:00.000Z',
        orderCount: 2,
      },
      {
        compositionSignature: 'signature-3',
        lines: [{ itemId: 'item-1', itemName: 'אנטריקוט פרימיום', quantity: 1, unit: 'unit' }],
        lastOrderedAt: '2026-04-05T16:00:00.000Z',
        orderCount: 1,
      },
      {
        compositionSignature: 'signature-4',
        lines: [{ itemId: 'item-2', itemName: 'מוצר 2', quantity: 2, unit: 'unit' }],
        lastOrderedAt: '2026-04-04T12:00:00.000Z',
        orderCount: 1,
      },
    ],
    total: 4,
    pageSize: 20,
    sortBy: 'lastOrderedAt_desc_compositionSignature_asc',
    generatedAt: '2099-04-08T14:00:00.000Z',
    windowStartAt: '2099-03-09T14:00:00.000Z',
  },
  priceListVersion: 'v-1',
};

const portalDataResponse: CustomerPortalDataResponse = {
  customer: { customerId: 'cust-1' },
  sessionExpiresAt: '2099-04-08T14:00:00.000Z',
  recentItems: activationResponse.recentItems,
  recentOrders: activationResponse.recentOrders,
  approvedItems: activationResponse.approvedItems,
  pricing: activationResponse.pricing,
  priceListVersion: 'v-1',
};

beforeEach(() => {
  __resetPortalSessionForTests();
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000123');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  __resetPortalSessionForTests();
});

describe('customer portal runtime routes', () => {
  it('activates /m/[token] and opens /order with composed UI', async () => {
    const activationDeferred = createDeferred<CustomerSessionActivateResponse>();
    const activateSession = vi.fn(() => activationDeferred.promise);
    const getPortalData = vi.fn(async () => portalDataResponse);
    const submitOrder = vi.fn(async () => ({ orderId: 'order-1', orderRef: 'ORD-1', status: 'submitted' as const }));

    renderWithRouter({ activateSession, getPortalData, submitOrder }, '/m/token-abc');

    expect(screen.getByRole('heading', { name: 'מפעילים את קישור ההזמנה…' })).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId('activation-weak-network').textContent).toContain('זוהתה רשת איטית');
    });

    activationDeferred.resolve(activationResponse);
    await waitFor(() => {
      expect(screen.getByTestId('portal-heading').textContent).toContain('עואודה לשיווק בע״מ');
    });

    expect(screen.getByText('הזמנות אחרונות')).toBeTruthy();
    expect(screen.getByText('קטלוג מוצרים')).toBeTruthy();
    const welcomeHeading = screen.getByRole('heading', { level: 1, name: /ברוכים הבאים/i });
    expect(welcomeHeading.querySelector('.portal-welcome-customer')).toBeTruthy();
    const approvedFallbackImage = screen.getByAltText('מוצר 2');
    expect((approvedFallbackImage as HTMLImageElement).src).toContain('/v1/testing-assets/items/item-2/image?v=testing-cuts-v');
    expect(screen.getAllByText('לחיצה אחת טוענת את הרכב ההזמנה לסל.').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('layout-state')).toBeNull();
    expect(screen.queryByText(/תצוגה:/)).toBeNull();
    expect(screen.getByTestId('screen-portal-order-composer').getAttribute('dir')).toBe('rtl');
    expect(screen.getByTestId('screen-portal-order-composer').getAttribute('lang')).toBe('he');
    for (const placeholder of screen.getAllByRole('img', { name: 'תמונת מוצר אינה זמינה כרגע' })) {
      expect(placeholder.getAttribute('style') ?? '').not.toContain('picsum.photos');
      expect(placeholder.getAttribute('style') ?? '').not.toContain('http');
    }
    expect(activateSession).toHaveBeenCalledWith('token-abc');
  });

  it('loads a recent order into cart on one click and paginates cards', async () => {
    __setPortalSessionForTests({
      sessionToken: 'session-123',
      customerId: 'cust-1',
      sessionExpiresAt: '2099-04-08T14:00:00.000Z',
      payload: portalDataResponse,
    });

    const activateSession = vi.fn(async () => activationResponse);
    const getPortalData = vi.fn(async () => portalDataResponse);
    const submitOrder = vi.fn(async () => ({ orderId: 'order-1', orderRef: 'ORD-1', status: 'submitted' as const }));

    renderWithRouter({ activateSession, getPortalData, submitOrder }, '/order');

    await waitFor(() => {
      expect(screen.getByTestId('screen-portal-recent-orders')).toBeTruthy();
    });

    expect(screen.queryByTestId('recent-order-card-4')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'הבא' }));
    expect(screen.getByTestId('recent-order-card-4')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'הקודם' }));

    await userEvent.click(screen.getByTestId('recent-order-card-1'));

    const firstQuantity = screen.getByRole('spinbutton', { name: 'כמות אנטריקוט פרימיום' }) as HTMLInputElement;
    const secondQuantity = screen.getByRole('spinbutton', { name: 'כמות מוצר 2' }) as HTMLInputElement;
    expect(firstQuantity.value).toBe('2');
    expect(secondQuantity.value).toBe('1');
    expect(screen.getByTestId('sticky-submit-bar').textContent).toContain('סה"כ משוער ₪135.00');
    expect(screen.getByTestId('sticky-submit-bar').textContent).toContain('שליחת הזמנה למפעל (3 יחידות)');
  });

  it('falls back gracefully when recent-orders contract fields are missing', async () => {
    __setPortalSessionForTests({
      sessionToken: 'session-123',
      customerId: 'cust-1',
      sessionExpiresAt: '2099-04-08T14:00:00.000Z',
      payload: portalDataResponse,
    });

    const activationResponseWithoutRecentOrders = {
      ...activationResponse,
      recentOrders: undefined,
    } as unknown as CustomerSessionActivateResponse;
    const portalDataWithoutRecentOrders = {
      ...portalDataResponse,
      recentOrders: undefined,
    } as unknown as CustomerPortalDataResponse;

    const activateSession = vi.fn(async () => activationResponseWithoutRecentOrders);
    const getPortalData = vi.fn(async () => portalDataWithoutRecentOrders);
    const submitOrder = vi.fn(async () => ({ orderId: 'order-1', orderRef: 'ORD-1', status: 'submitted' as const }));

    renderWithRouter({ activateSession, getPortalData, submitOrder }, '/order');

    await waitFor(() => {
      expect(screen.getByText('היסטוריית ההזמנות תוצג כאן ברגע שתהיה זמינה.')).toBeTruthy();
    });
    expect(screen.getByText('קטלוג מוצרים')).toBeTruthy();
  });

  it('activates /m?token=... links and opens /order', async () => {
    const activateSession = vi.fn(async () => activationResponse);
    const getPortalData = vi.fn(async () => portalDataResponse);
    const submitOrder = vi.fn(async () => ({ orderId: 'order-1', orderRef: 'ORD-1', status: 'submitted' as const }));

    renderWithRouter({ activateSession, getPortalData, submitOrder }, '/m?token=token-query-123');

    await waitFor(() => {
      expect(screen.getByTestId('portal-heading').textContent).toContain('עואודה לשיווק בע״מ');
    });

    expect(activateSession).toHaveBeenCalledWith('token-query-123');
  });

  it('keeps activation flow working when sessionStorage is unavailable', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    const activateSession = vi.fn(async () => activationResponse);
    const getPortalData = vi.fn(async () => portalDataResponse);
    const submitOrder = vi.fn(async () => ({ orderId: 'order-1', orderRef: 'ORD-1', status: 'submitted' as const }));

    renderWithRouter({ activateSession, getPortalData, submitOrder }, '/m/token-storage-fallback');

    await waitFor(() => {
      expect(screen.getByTestId('portal-heading').textContent).toContain('עואודה לשיווק בע״מ');
    });

    expect(activateSession).toHaveBeenCalledWith('token-storage-fallback');
    setItemSpy.mockRestore();
  });

  it('does not render disconnect controls on /order', async () => {
    __setPortalSessionForTests({
      sessionToken: 'session-123',
      customerId: 'cust-1',
      sessionExpiresAt: '2099-04-08T14:00:00.000Z',
      payload: portalDataResponse,
    });

    const activateSession = vi.fn(async () => activationResponse);
    const getPortalData = vi.fn(async () => portalDataResponse);
    const submitOrder = vi.fn(async () => ({ orderId: 'order-1', orderRef: 'ORD-1', status: 'submitted' as const }));
    const logoutSession = vi.fn(async () => undefined);

    renderWithRouter({ activateSession, getPortalData, submitOrder, logoutSession }, '/order');

    await waitFor(() => {
      expect(screen.getByTestId('portal-heading').textContent).toContain('עואודה לשיווק בע״מ');
    });

    expect(screen.queryByRole('button', { name: 'התנתקות' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'מתנתקים…' })).toBeNull();
    expect(logoutSession).not.toHaveBeenCalled();
  });

  it('wires quantity controls into estimated total and sticky submit state', async () => {
    __setPortalSessionForTests({
      sessionToken: 'session-123',
      customerId: 'cust-1',
      sessionExpiresAt: '2099-04-08T14:00:00.000Z',
      payload: portalDataResponse,
    });

    const activateSession = vi.fn(async () => activationResponse);
    const getPortalData = vi.fn(async () => portalDataResponse);
    const submitOrder = vi.fn(async () => ({ orderId: 'order-1', orderRef: 'ORD-1', status: 'submitted' as const }));

    renderWithRouter({ activateSession, getPortalData, submitOrder }, '/order');

    await waitFor(() => {
      expect(screen.getByTestId('portal-heading').textContent).toContain('עואודה לשיווק בע״מ');
    });

    await userEvent.click(screen.getByRole('button', { name: 'הגדלת כמות אנטריקוט פרימיום' }));
    await userEvent.click(screen.getByRole('button', { name: 'הגדלת כמות מוצר 2' }));

    expect(screen.getByText('פריטים')).toBeTruthy();
    expect(
      screen.getAllByText((_, element) => element?.textContent?.includes('סכום כולל') ?? false)
        .length,
    ).toBeGreaterThan(0);

    const stickyBar = screen.getByTestId('sticky-submit-bar');
    const orderSummary = screen.getByLabelText('סיכום הזמנה');
    expect(stickyBar.textContent).toContain('סה"כ משוער ₪92.50');
    expect(stickyBar.textContent).toContain('שליחת הזמנה למפעל (2 יחידות)');
    expect(orderSummary.textContent).toContain('סכום ביניים₪92.50');
    expect(orderSummary.textContent).toContain('סכום כולל₪92.50');
    expect(orderSummary.textContent).not.toContain('דמי לוגיסטיקה');
  });

  it('shows weak-network then resilient error state on /order load failure', async () => {
    __setPortalSessionForTests({
      sessionToken: 'session-123',
      customerId: 'cust-1',
      sessionExpiresAt: '2099-04-08T14:00:00.000Z',
      payload: portalDataResponse,
    });

    const loadDeferred = createDeferred<CustomerPortalDataResponse>();
    const activateSession = vi.fn(async () => activationResponse);
    const getPortalData = vi.fn(() => loadDeferred.promise);
    const submitOrder = vi.fn(async () => ({ orderId: 'order-1', orderRef: 'ORD-1', status: 'submitted' as const }));

    renderWithRouter({ activateSession, getPortalData, submitOrder }, '/order');

    await waitFor(() => {
      expect(screen.getByTestId('order-weak-network').textContent).toContain('הרשת איטית');
    });

    loadDeferred.reject(new Error('offline'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'לא הצלחנו לטעון את ההזמנה' })).toBeTruthy();
    });
    expect(screen.getByText('לא ניתן לטעון את נתוני ההזמנה כרגע. נסו שוב בעוד רגע.')).toBeTruthy();
  });

  it('clears stale session and routes to activation when portal token is rejected', async () => {
    __setPortalSessionForTests({
      sessionToken: 'session-stale',
      customerId: 'cust-1',
      sessionExpiresAt: '2099-04-08T14:00:00.000Z',
      payload: portalDataResponse,
    });

    const activateSession = vi.fn(async () => activationResponse);
    const getPortalData = vi.fn(async () => {
      throw new PortalApiError('expired_token', 'Expired');
    });
    const submitOrder = vi.fn(async () => ({ orderId: 'order-1', orderRef: 'ORD-1', status: 'submitted' as const }));

    renderWithRouter({ activateSession, getPortalData, submitOrder }, '/order');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'העמוד לא נמצא' })).toBeTruthy();
    });
    expect(getPortalData).toHaveBeenCalledTimes(1);
  });

  it('handles submit loading, mismatch recovery prompt, and reconfirmation payload', async () => {
    __setPortalSessionForTests({
      sessionToken: 'session-123',
      customerId: 'cust-1',
      sessionExpiresAt: '2099-04-08T14:00:00.000Z',
      payload: portalDataResponse,
    });

    const submitDeferred = createDeferred<CustomerOrderSubmitResponse>();
    const activateSession = vi.fn(async () => activationResponse);
    const getPortalData = vi.fn(async () => portalDataResponse);
    const mismatchError = new PortalApiError('order_mismatch', 'Mismatch', {
      code: 'ORDER_LINES_MISMATCH',
      lines: [
        {
          lineIndex: 0,
          itemId: 'item-1',
          reason: 'מחיר יחידה ב-ERP עודכן מ־42.50 ל־49.90',
          submittedUnitPrice: 42.5,
          currentUnitPrice: 49.9,
        },
      ],
    });
    const submitOrder = vi
      .fn<
        (sessionToken: string, idempotencyKey: string, request: CustomerOrderSubmitRequest) => Promise<CustomerOrderSubmitResponse>
      >()
      .mockImplementationOnce((_token, _key, request) => {
        expect(request.lines[0]).toMatchObject({ itemId: 'item-1', quantity: 1, unit: 'unit', clientUnitPrice: 42.5 });
        return submitDeferred.promise;
      })
      .mockResolvedValueOnce({
        orderId: 'order-1',
        orderRef: 'ORD-2026-00077',
        status: 'submitted',
      });

    renderWithRouter({ activateSession, getPortalData, submitOrder }, '/order');

    await waitFor(() => {
      expect(screen.getByTestId('portal-heading').textContent).toContain('עואודה לשיווק בע״מ');
    });

    await userEvent.click(screen.getByRole('button', { name: 'הגדלת כמות אנטריקוט פרימיום' }));
    const submitButton = screen.getByRole('button', { name: 'שליחת הזמנה למפעל (1 יחידות)' });

    await userEvent.click(submitButton);
    expect(screen.getByRole('button', { name: 'שולחים הזמנה…' }).hasAttribute('disabled')).toBe(true);

    submitDeferred.reject(mismatchError);

    await waitFor(() => {
      expect(screen.getByTestId('screen-portal-order-mismatch')).toBeTruthy();
    });

    expect(screen.getByTestId('screen-portal-order-mismatch').textContent).toContain('מחיר יחידה ב-ERP עודכן מ־42.50 ל־49.90');
    await userEvent.click(screen.getByRole('button', { name: 'אשר ושדר הזמנה' }));

    await waitFor(() => {
      expect(screen.getByTestId('screen-portal-order-success')).toBeTruthy();
    });

    expect(submitOrder).toHaveBeenCalledTimes(2);
    const reconfirmRequest = submitOrder.mock.calls[1][2];
    expect(reconfirmRequest.lines[0].clientUnitPrice).toBe(49.9);
  });

  it('shows ERP outage guidance and supports retrying submit without reloading', async () => {
    __setPortalSessionForTests({
      sessionToken: 'session-123',
      customerId: 'cust-1',
      sessionExpiresAt: '2099-04-08T14:00:00.000Z',
      payload: portalDataResponse,
    });

    const activateSession = vi.fn(async () => activationResponse);
    const getPortalData = vi.fn(async () => portalDataResponse);
    const submitOrder = vi
      .fn<(sessionToken: string, idempotencyKey: string, request: CustomerOrderSubmitRequest) => Promise<CustomerOrderSubmitResponse>>()
      .mockRejectedValueOnce(new PortalApiError('erp_unavailable', 'ERP down'))
      .mockResolvedValueOnce({
        orderId: 'order-1',
        orderRef: 'ORD-2026-00999',
        status: 'submitted',
      });

    renderWithRouter({ activateSession, getPortalData, submitOrder }, '/order');

    await waitFor(() => {
      expect(screen.getByTestId('portal-heading').textContent).toContain('עואודה לשיווק בע״מ');
    });

    await userEvent.click(screen.getByRole('button', { name: 'הגדלת כמות אנטריקוט פרימיום' }));
    await userEvent.click(screen.getByRole('button', { name: 'שליחת הזמנה למפעל (1 יחידות)' }));

    await waitFor(() => {
      expect(screen.getByTestId('submit-error')).toBeTruthy();
    });
    expect(screen.getByTestId('submit-error').textContent).toContain(
      'המערכת עמוסה זמנית ולא ניתן להשלים את ההזמנה כרגע. נסו שוב בעוד דקה באמצעות "נסו לשלוח שוב".',
    );
    expect(screen.getByRole('button', { name: 'שליחת הזמנה למפעל (1 יחידות)' }).hasAttribute('disabled')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'נסו לשלוח שוב' }));

    await waitFor(() => {
      expect(screen.getByTestId('screen-portal-order-success')).toBeTruthy();
    });
    expect(screen.getByTestId('screen-portal-order-success').querySelector('bdi')?.getAttribute('dir')).toBe('ltr');

    expect(getPortalData).toHaveBeenCalledTimes(1);
    expect(submitOrder).toHaveBeenCalledTimes(2);
  });

  it('allows submitting another order after success confirmation', async () => {
    __setPortalSessionForTests({
      sessionToken: 'session-123',
      customerId: 'cust-1',
      sessionExpiresAt: '2099-04-08T14:00:00.000Z',
      payload: portalDataResponse,
    });

    const activateSession = vi.fn(async () => activationResponse);
    const getPortalData = vi.fn(async () => portalDataResponse);
    const submitOrder = vi
      .fn<(sessionToken: string, idempotencyKey: string, request: CustomerOrderSubmitRequest) => Promise<CustomerOrderSubmitResponse>>()
      .mockResolvedValueOnce({
        orderId: 'order-1',
        orderRef: 'ORD-2026-00077',
        status: 'submitted',
      })
      .mockResolvedValueOnce({
        orderId: 'order-2',
        orderRef: 'ORD-2026-00078',
        status: 'submitted',
      });

    renderWithRouter({ activateSession, getPortalData, submitOrder }, '/order');

    await waitFor(() => {
      expect(screen.getByTestId('portal-heading').textContent).toContain('עואודה לשיווק בע״מ');
    });

    await userEvent.click(screen.getByRole('button', { name: 'הגדלת כמות אנטריקוט פרימיום' }));
    await userEvent.click(screen.getByRole('button', { name: 'שליחת הזמנה למפעל (1 יחידות)' }));

    await waitFor(() => {
      expect(screen.getByTestId('screen-portal-order-success')).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: 'הזמנה נוספת' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'הזמנה נוספת' }));

    await waitFor(() => {
      expect(screen.queryByTestId('screen-portal-order-success')).toBeNull();
    });

    expect(screen.getByRole('button', { name: 'שליחת הזמנה למפעל (1 יחידות)' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'הגדלת כמות אנטריקוט פרימיום' }).hasAttribute('disabled')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'שליחת הזמנה למפעל (1 יחידות)' }));
    await waitFor(() => {
      expect(submitOrder).toHaveBeenCalledTimes(2);
    });
  });
});

function renderWithRouter(
  api: Pick<PortalApiClient, 'activateSession' | 'getPortalData' | 'submitOrder'> &
    Partial<Pick<PortalApiClient, 'logoutSession'>>,
  initialPath: string,
): void {
  const apiClient = {
    ...api,
    logoutSession: api.logoutSession ?? (async () => undefined),
  } as PortalApiClient;

  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <CustomerPortalRoutes apiClient={apiClient} config={{ weakNetworkThresholdMs: 1 }} />
    </MemoryRouter>,
  );
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}
