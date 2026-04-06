import type { CustomerPortalDataPayload, CustomerSessionActivateResponse } from '@meatland/shared-types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';

import {
  clearOrderSubmitting,
  createOrderErrorState,
  createOrderLoadingState,
  createOrderReadyState,
  decrementOrderLineQuantity,
  incrementOrderLineQuantity,
  markOrderSubmitting,
  markOrderLoadingWeakNetwork,
  setOrderLineQuantity,
  type OrderPageState,
  type OrderSectionItem,
} from './order-composition-flow';
import type { PortalApiClient } from './portal-api-client';
import { PortalApiError } from './portal-api-client';
import {
  createIdleState,
  markMismatch,
  markSubmitError,
  markSubmitting,
  markSuccess,
  type OrderSubmitState,
} from './order-submit-state';
import {
  createActivationIdleState,
  markActivationError,
  markActivationReady,
  markActivationStarted,
  markActivationWeakNetwork,
  type ActivationBootstrapState,
} from './token-activation-route';

type StoredPortalSession = {
  sessionToken: string;
  customerId: string;
  sessionExpiresAt: string;
  payload: CustomerPortalDataPayload;
};

const SESSION_STORAGE_KEY = 'customer-portal-session';
const WEAK_NETWORK_THRESHOLD_MS = 2_500;

type RouteConfig = {
  weakNetworkThresholdMs: number;
};

export function CustomerPortalApp({ apiClient }: { apiClient: PortalApiClient }): ReactElement {
  return (
    <BrowserRouter>
      <CustomerPortalRoutes apiClient={apiClient} />
    </BrowserRouter>
  );
}

export function CustomerPortalRoutes({
  apiClient,
  config,
}: {
  apiClient: PortalApiClient;
  config?: Partial<RouteConfig>;
}): ReactElement {
  const resolvedConfig: RouteConfig = {
    weakNetworkThresholdMs: config?.weakNetworkThresholdMs ?? WEAK_NETWORK_THRESHOLD_MS,
  };

  return (
    <Routes>
      <Route
        path="/m/:token"
        element={<ActivationRoute apiClient={apiClient} weakNetworkThresholdMs={resolvedConfig.weakNetworkThresholdMs} />}
      />
      <Route
        path="/order"
        element={<OrderRoute apiClient={apiClient} weakNetworkThresholdMs={resolvedConfig.weakNetworkThresholdMs} />}
      />
      <Route path="*" element={<Navigate to="/order" replace />} />
    </Routes>
  );
}

function ActivationRoute({
  apiClient,
  weakNetworkThresholdMs,
}: {
  apiClient: PortalApiClient;
  weakNetworkThresholdMs: number;
}): ReactElement {
  const navigate = useNavigate();
  const params = useParams();
  const token = params.token ?? '';
  const [state, setState] = useState<ActivationBootstrapState>(() => createActivationIdleState(token));

  useEffect(() => {
    setState(createActivationIdleState(token));
  }, [token]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const activate = async (): Promise<void> => {
      if (!token.trim()) {
        setState((current) => markActivationError(current, 'invalid_token'));
        return;
      }

      const startedAtMs = Date.now();
      setState((current) => markActivationStarted(current, startedAtMs));

      timer = setTimeout(() => {
        setState((current) =>
          current.status === 'activating'
            ? markActivationWeakNetwork(current, current.startedAtMs + WEAK_NETWORK_THRESHOLD_MS + 1)
            : current,
        );
      }, weakNetworkThresholdMs);

      try {
        const payload = await apiClient.activateSession(token);

        if (cancelled) {
          return;
        }

        writePortalSession(payload);
        setState(markActivationReady(payload));
        navigate('/order', { replace: true });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const reason = toActivationErrorReason(error);
        setState((current) => markActivationError(current, reason));
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    };

    void activate();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [apiClient, navigate, token, weakNetworkThresholdMs]);

  if (state.status === 'error') {
    return (
      <main>
        <h1>Activation failed</h1>
        <p>{state.message}</p>
        <button onClick={() => setState(createActivationIdleState(token))} type="button">
          Retry activation
        </button>
      </main>
    );
  }

  if (state.status === 'ready') {
    return (
      <main>
        <h1>Opening your order…</h1>
      </main>
    );
  }

  return (
    <main>
      <h1>Activating your order link…</h1>
      <p>Please wait while we load your account.</p>
      {state.status === 'activating' && state.weakNetworkHint ? (
        <p data-testid="activation-weak-network">Slow network detected. Keep this page open.</p>
      ) : null}
    </main>
  );
}

function OrderRoute({
  apiClient,
  weakNetworkThresholdMs,
}: {
  apiClient: PortalApiClient;
  weakNetworkThresholdMs: number;
}): ReactElement {
  const [state, setState] = useState<OrderPageState>(createOrderLoadingState());
  const [submitState, setSubmitState] = useState<OrderSubmitState>(createIdleState());
  const session = useMemo(() => readPortalSession(), []);
  const submitIdempotencyKeyRef = useRef<string | null>(null);

  const resetSubmitDraft = useCallback(() => {
    if (submitState.status === 'success') {
      return;
    }

    submitIdempotencyKeyRef.current = null;
    setSubmitState(createIdleState());
  }, [submitState.status]);

  const loadPortalData = useCallback(
    async (preservedQuantities: Record<string, number> = {}): Promise<void> => {
      if (!session) {
        setState(createOrderErrorState('Session missing. Open your magic link again.'));
        return;
      }

      let timer: ReturnType<typeof setTimeout> | undefined;
      setState(createOrderLoadingState());
      timer = setTimeout(() => {
        setState((current) => markOrderLoadingWeakNetwork(current));
      }, weakNetworkThresholdMs);

      try {
        const payload = await apiClient.getPortalData(session.sessionToken);
        writePortalSession({ ...session, ...payload });
        setState(
          createOrderReadyState({
            ...toOrderInput(payload),
            initialQuantities: preservedQuantities,
          }),
        );
      } catch (error) {
        setState(createOrderErrorState(toOrderErrorMessage(error)));
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    },
    [apiClient, session, weakNetworkThresholdMs],
  );

  useEffect(() => {
    if (!session) {
      setState(createOrderErrorState('Session missing. Open your magic link again.'));
      return;
    }

    let cancelled = false;

    void (async () => {
      await loadPortalData();
      if (cancelled) {
        return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadPortalData, session]);

  const updateQuantity = (itemId: string, nextQuantity: number): void => {
    if (submitState.status === 'success') {
      return;
    }

    setState((current) => setOrderLineQuantity(current, itemId, nextQuantity));
    resetSubmitDraft();
  };

  const adjustQuantity = (itemId: string, direction: 'increment' | 'decrement'): void => {
    if (submitState.status === 'success') {
      return;
    }

    setState((current) =>
      direction === 'increment'
        ? incrementOrderLineQuantity(current, itemId)
        : decrementOrderLineQuantity(current, itemId),
    );
    resetSubmitDraft();
  };

  const handleSubmit = async (forceNewIdempotencyKey = false): Promise<void> => {
    if (!session || state.status !== 'ready') {
      return;
    }

    if (submitState.status === 'success') {
      return;
    }

    const mismatchOverrides =
      submitState.status === 'mismatch'
        ? new Map(submitState.lines.map((line) => [line.itemId, line.currentUnitPrice]))
        : new Map<string, number | undefined>();

    const submitLines = state.cart.lines.map((line) => {
      const overridePrice = mismatchOverrides.get(line.itemId);
      const resolvedUnitPrice = overridePrice ?? state.sections.recent.items.find((item) => item.itemId === line.itemId)?.unitPrice;
      const fallbackPrice = state.sections.approved.items.find((item) => item.itemId === line.itemId)?.unitPrice;
      const unitPrice = resolvedUnitPrice ?? fallbackPrice;

      if (unitPrice === null || unitPrice === undefined) {
        return null;
      }

      return {
        itemId: line.itemId,
        quantity: line.quantity,
        unit: 'unit' as const,
        clientUnitPrice: unitPrice,
      };
    });

    if (submitLines.some((line) => line === null)) {
      setSubmitState(markSubmitError('Some lines are missing pricing. Refresh prices and try again.'));
      return;
    }

    if (submitLines.length === 0) {
      setSubmitState(markSubmitError('Add at least one item before submitting.'));
      return;
    }

    if (forceNewIdempotencyKey || !submitIdempotencyKeyRef.current) {
      submitIdempotencyKeyRef.current = crypto.randomUUID();
    }

    setSubmitState(markSubmitting());
    setState((current) => markOrderSubmitting(current));

    try {
      const response = await apiClient.submitOrder(session.sessionToken, submitIdempotencyKeyRef.current, {
        lines: submitLines.filter((line): line is NonNullable<typeof line> => line !== null),
      });
      setSubmitState(markSuccess(response.orderRef));
      setState((current) => clearOrderSubmitting(current));
    } catch (error) {
      setState((current) => clearOrderSubmitting(current));

      if (error instanceof PortalApiError && error.kind === 'order_mismatch' && error.mismatch) {
        submitIdempotencyKeyRef.current = null;
        setSubmitState(markMismatch(error.mismatch.lines));
        return;
      }

      const message = toOrderSubmitErrorMessage(error);
      setSubmitState(markSubmitError(message));
    }
  };

  const refreshAfterMismatch = async (): Promise<void> => {
    if (state.status !== 'ready') {
      return;
    }

    const quantities = Object.fromEntries(state.cart.lines.map((line) => [line.itemId, line.quantity]));
    submitIdempotencyKeyRef.current = null;
    await loadPortalData(quantities);
    if (submitState.status !== 'success') {
      setSubmitState(createIdleState());
    }
  };

  if (state.status === 'loading') {
    return (
      <main>
        <h1>Loading order page…</h1>
        {state.weakNetworkHint ? <p data-testid="order-weak-network">Network is slow. Content will appear soon.</p> : null}
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main>
        <h1>Could not load your order</h1>
        <p>{state.message}</p>
      </main>
    );
  }

  const renderItem = (item: OrderSectionItem): ReactElement => (
    <li key={item.itemId}>
      <strong>{item.name}</strong>
      <div>
        <button
          aria-label={`Decrease ${item.name}`}
          disabled={state.isSubmitting || submitState.status === 'success'}
          onClick={() => adjustQuantity(item.itemId, 'decrement')}
          type="button"
        >
          −
        </button>
        <input
          aria-label={`Quantity ${item.name}`}
          disabled={state.isSubmitting || submitState.status === 'success'}
          inputMode="numeric"
          onChange={(event) => updateQuantity(item.itemId, Number(event.currentTarget.value))}
          type="number"
          value={item.quantity}
        />
        <button
          aria-label={`Increase ${item.name}`}
          disabled={state.isSubmitting || submitState.status === 'success'}
          onClick={() => adjustQuantity(item.itemId, 'increment')}
          type="button"
        >
          +
        </button>
      </div>
      <p>{item.unitPrice === null ? 'Price unavailable' : `${item.currency} ${item.unitPrice.toFixed(2)} / unit`}</p>
    </li>
  );

  return (
    <main>
      <h1>Compose order</h1>
      <p data-testid="layout-state">Layout: {state.layout}</p>

      <section>
        <h2>{state.sections.recent.title}</h2>
        {state.sections.recent.items.length === 0 ? (
          <p>{state.sections.recent.emptyMessage}</p>
        ) : (
          <ul>{state.sections.recent.items.map(renderItem)}</ul>
        )}
      </section>

      <section>
        <h2>{state.sections.approved.title}</h2>
        {state.sections.approved.items.length === 0 ? (
          <p>{state.sections.approved.emptyMessage}</p>
        ) : (
          <ul>{state.sections.approved.items.map(renderItem)}</ul>
        )}
      </section>

      <section aria-label="Cart summary">
        <h2>Cart summary</h2>
        <p>Total units: {state.cart.totalUnits}</p>
        <p>Estimated total: {state.cart.estimatedTotal.toFixed(2)}</p>
        <p>{state.submitBar.summaryLabel}</p>
      </section>

      {submitState.status === 'mismatch' ? (
        <section aria-live="polite" data-testid="submit-mismatch" style={{ border: '1px solid #f3b700', padding: '0.75rem' }}>
          <h2>Prices changed before submission</h2>
          <p>Review the highlighted lines, then refresh prices or reconfirm your order.</p>
          <ul>
            {submitState.lines.map((line) => (
              <li key={`${line.itemId}-${line.lineIndex}`}>
                {line.itemId}: {line.reason}
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={() => void refreshAfterMismatch()} type="button">
              Refresh prices
            </button>
            <button onClick={() => void handleSubmit(true)} type="button">
              Reconfirm and submit
            </button>
          </div>
        </section>
      ) : null}

      {submitState.status === 'error' ? (
        <p aria-live="polite" data-testid="submit-error">
          {submitState.message}
        </p>
      ) : null}

      {submitState.status === 'success' ? (
        <section aria-live="polite" data-testid="submit-success">
          <h2>Order submitted successfully</h2>
          <p>Reference: {submitState.orderRef}</p>
          <p>This order is confirmed. Duplicate submissions are disabled.</p>
        </section>
      ) : null}

      <footer
        data-testid="sticky-submit-bar"
        style={{
          position: 'sticky',
          bottom: 0,
          padding: '0.75rem',
          borderTop: '1px solid #ddd',
          backgroundColor: '#fff',
        }}
      >
        <p>{state.submitBar.summaryLabel}</p>
        <button
          disabled={!state.submitBar.submitEnabled || submitState.status === 'success' || submitState.status === 'mismatch'}
          onClick={() => void handleSubmit()}
          style={{ width: '100%', minHeight: '2.75rem' }}
          type="button"
        >
          {state.submitBar.submitLabel}
        </button>
      </footer>
    </main>
  );
}

function toActivationErrorReason(error: unknown): 'invalid_token' | 'expired_token' | 'network' | 'server' {
  if (error instanceof PortalApiError) {
    if (error.kind === 'invalid_token' || error.kind === 'expired_token' || error.kind === 'network') {
      return error.kind;
    }

    return 'server';
  }

  return 'server';
}

function toOrderErrorMessage(error: unknown): string {
  if (error instanceof PortalApiError && error.kind === 'network') {
    return 'Connection is unstable. Check your signal and retry.';
  }

  return 'Unable to load order data right now. Please retry in a moment.';
}

function toOrderSubmitErrorMessage(error: unknown): string {
  if (error instanceof PortalApiError) {
    if (error.kind === 'network') {
      return 'Connection dropped while submitting. Retry to confirm your order status.';
    }

    if (error.kind === 'idempotency_conflict') {
      return 'Submission key expired. Please review your cart and submit again.';
    }
  }

  return 'Could not submit order right now. Please try again.';
}

function toOrderInput(payload: CustomerPortalDataPayload) {
  return {
    recentItems: payload.recentItems,
    approvedItems: payload.approvedItems,
    pricing: payload.pricing,
    viewportWidthPx: window.innerWidth,
  };
}

function writePortalSession(payload: CustomerSessionActivateResponse | StoredPortalSession): void {
  const session = 'payload' in payload ? payload : toStoredPortalSession(payload);
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function readPortalSession(): StoredPortalSession | null {
  const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredPortalSession;
    if (
      typeof parsed.sessionToken !== 'string' ||
      typeof parsed.customerId !== 'string' ||
      typeof parsed.sessionExpiresAt !== 'string'
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function toStoredPortalSession(payload: CustomerSessionActivateResponse): StoredPortalSession {
  return {
    sessionToken: payload.sessionToken,
    customerId: payload.customer.customerId,
    sessionExpiresAt: payload.sessionExpiresAt,
    payload: {
      customer: payload.customer,
      recentItems: payload.recentItems,
      approvedItems: payload.approvedItems,
      pricing: payload.pricing,
      priceListVersion: payload.priceListVersion,
      sessionExpiresAt: payload.sessionExpiresAt,
    },
  };
}

export function __resetPortalSessionForTests(): void {
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

export function __setPortalSessionForTests(session: StoredPortalSession): void {
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}
