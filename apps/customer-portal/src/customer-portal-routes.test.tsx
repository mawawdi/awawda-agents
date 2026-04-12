// @vitest-environment jsdom

import type {
  CustomerOrderSubmitRequest,
  CustomerOrderSubmitResponse,
  CustomerPortalDataResponse,
  CustomerSessionActivateResponse,
} from '@meatland/shared-types';
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
      name: 'Ribeye Steak',
      lastOrderedAt: '2026-04-07T10:00:00.000Z',
    },
  ],
  approvedItems: [
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
  priceListVersion: 'v-1',
};

const portalDataResponse: CustomerPortalDataResponse = {
  customer: { customerId: 'cust-1' },
  sessionExpiresAt: '2099-04-08T14:00:00.000Z',
  recentItems: activationResponse.recentItems,
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
      expect(screen.getByTestId('portal-heading').textContent).toContain('קטלוג');
    });

    expect(screen.getByText('הנתחים הקבועים שלכם')).toBeTruthy();
    expect(screen.getByText('קטלוג מאושר')).toBeTruthy();
    expect(screen.getByTestId('layout-state').textContent).toContain('מובייל');
    expect(screen.getByTestId('portal-shell').getAttribute('dir')).toBe('rtl');
    expect(screen.getByTestId('portal-shell').getAttribute('lang')).toBe('he');
    expect(activateSession).toHaveBeenCalledWith('token-abc');
  });

  it('activates /m?token=... links and opens /order', async () => {
    const activateSession = vi.fn(async () => activationResponse);
    const getPortalData = vi.fn(async () => portalDataResponse);
    const submitOrder = vi.fn(async () => ({ orderId: 'order-1', orderRef: 'ORD-1', status: 'submitted' as const }));

    renderWithRouter({ activateSession, getPortalData, submitOrder }, '/m?token=token-query-123');

    await waitFor(() => {
      expect(screen.getByTestId('portal-heading').textContent).toContain('קטלוג');
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
      expect(screen.getByTestId('portal-heading').textContent).toContain('קטלוג');
    });

    expect(activateSession).toHaveBeenCalledWith('token-storage-fallback');
    setItemSpy.mockRestore();
  });

  it('logs out current session and routes back to activation state', async () => {
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
      expect(screen.getByTestId('portal-heading').textContent).toContain('קטלוג');
    });

    await userEvent.click(screen.getByRole('button', { name: 'התנתקות מהסשן' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'הפעלת הקישור נכשלה' })).toBeTruthy();
    });
    expect(logoutSession).toHaveBeenCalledWith('session-123');
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
      expect(screen.getByTestId('portal-heading').textContent).toContain('קטלוג');
    });

    await userEvent.click(screen.getByRole('button', { name: 'הגדלת כמות Ribeye Steak' }));
    await userEvent.click(screen.getByRole('button', { name: 'הגדלת כמות פריט מאושר item-2' }));

    expect(screen.getByText('סה״כ יחידות: 2')).toBeTruthy();
    expect(
      screen.getAllByText((_, element) => element?.textContent?.includes('סה״כ משוער: 92.50') ?? false)
        .length,
    ).toBeGreaterThan(0);

    const stickyBar = screen.getByTestId('sticky-submit-bar');
    expect(stickyBar.textContent).toContain('סה"כ משוער ₪92.50');
    expect(stickyBar.textContent).toContain('שליחת הזמנה למפעל (2 יחידות)');
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
      expect(screen.getByRole('heading', { name: 'הפעלת הקישור נכשלה' })).toBeTruthy();
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
          reason: 'ERP unit price changed from 42.50 to 49.90',
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
      expect(screen.getByTestId('portal-heading').textContent).toContain('קטלוג');
    });

    await userEvent.click(screen.getByRole('button', { name: 'הגדלת כמות Ribeye Steak' }));
    const submitButton = screen.getByRole('button', { name: 'שליחת הזמנה למפעל (1 יחידות)' });

    await userEvent.click(submitButton);
    expect(screen.getByRole('button', { name: 'שולחים הזמנה…' }).hasAttribute('disabled')).toBe(true);

    submitDeferred.reject(mismatchError);

    await waitFor(() => {
      expect(screen.getByTestId('submit-mismatch')).toBeTruthy();
    });

    expect(screen.getByTestId('submit-mismatch').textContent).toContain('ERP unit price changed from 42.50 to 49.90');
    await userEvent.click(screen.getByRole('button', { name: 'אישור מחדש ושליחה' }));

    await waitFor(() => {
      expect(screen.getByTestId('submit-success')).toBeTruthy();
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
      expect(screen.getByTestId('portal-heading').textContent).toContain('קטלוג');
    });

    await userEvent.click(screen.getByRole('button', { name: 'הגדלת כמות Ribeye Steak' }));
    await userEvent.click(screen.getByRole('button', { name: 'שליחת הזמנה למפעל (1 יחידות)' }));

    await waitFor(() => {
      expect(screen.getByTestId('submit-error')).toBeTruthy();
    });
    expect(screen.getByTestId('submit-error').textContent).toContain(
      'ההזמנות זמנית לא זמינות בגלל תקלה ב-ERP. נסו שוב בעוד דקה באמצעות "נסו לשלוח שוב".',
    );
    expect(screen.getByRole('button', { name: 'שליחת הזמנה למפעל (1 יחידות)' }).hasAttribute('disabled')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'נסו לשלוח שוב' }));

    await waitFor(() => {
      expect(screen.getByTestId('submit-success')).toBeTruthy();
    });
    expect(screen.getByTestId('submit-success').querySelector('bdi')?.getAttribute('dir')).toBe('ltr');

    expect(getPortalData).toHaveBeenCalledTimes(1);
    expect(submitOrder).toHaveBeenCalledTimes(2);
  });

  it('prevents duplicate submit action after success confirmation', async () => {
    __setPortalSessionForTests({
      sessionToken: 'session-123',
      customerId: 'cust-1',
      sessionExpiresAt: '2099-04-08T14:00:00.000Z',
      payload: portalDataResponse,
    });

    const activateSession = vi.fn(async () => activationResponse);
    const getPortalData = vi.fn(async () => portalDataResponse);
    const submitOrder = vi.fn(async () => ({
      orderId: 'order-1',
      orderRef: 'ORD-2026-00077',
      status: 'submitted' as const,
    }));

    renderWithRouter({ activateSession, getPortalData, submitOrder }, '/order');

    await waitFor(() => {
      expect(screen.getByTestId('portal-heading').textContent).toContain('קטלוג');
    });

    await userEvent.click(screen.getByRole('button', { name: 'הגדלת כמות Ribeye Steak' }));
    await userEvent.click(screen.getByRole('button', { name: 'שליחת הזמנה למפעל (1 יחידות)' }));

    await waitFor(() => {
      expect(screen.getByTestId('submit-success')).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: 'שליחת הזמנה למפעל (1 יחידות)' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'הגדלת כמות Ribeye Steak' }).hasAttribute('disabled')).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'שליחת הזמנה למפעל (1 יחידות)' }));
    expect(submitOrder).toHaveBeenCalledTimes(1);
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
