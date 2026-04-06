import type { CustomerPortalDataPayload, CustomerSessionActivateResponse } from '@meatland/shared-types';
import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';

import {
  createOrderErrorState,
  createOrderLoadingState,
  createOrderReadyState,
  decrementOrderLineQuantity,
  incrementOrderLineQuantity,
  markOrderLoadingWeakNetwork,
  setOrderLineQuantity,
  type OrderPageState,
  type OrderSectionItem,
} from './order-composition-flow';
import type { PortalApiClient } from './portal-api-client';
import { PortalApiError } from './portal-api-client';
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

  const session = useMemo(() => readPortalSession(), []);

  useEffect(() => {
    if (!session) {
      setState(createOrderErrorState('Session missing. Open your magic link again.'));
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const loadPortalData = async (): Promise<void> => {
      setState(createOrderLoadingState());
      timer = setTimeout(() => {
        setState((current) => markOrderLoadingWeakNetwork(current));
      }, weakNetworkThresholdMs);

      try {
        const payload = await apiClient.getPortalData(session.sessionToken);
        if (cancelled) {
          return;
        }

        writePortalSession({ ...session, ...payload });
        setState(createOrderReadyState(toOrderInput(payload)));
      } catch (error) {
        if (cancelled) {
          return;
        }

        setState(createOrderErrorState(toOrderErrorMessage(error)));
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    };

    void loadPortalData();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [apiClient, session, weakNetworkThresholdMs]);

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
          onClick={() => setState((current) => decrementOrderLineQuantity(current, item.itemId))}
          type="button"
        >
          −
        </button>
        <input
          aria-label={`Quantity ${item.name}`}
          inputMode="numeric"
          onChange={(event) =>
            setState((current) => setOrderLineQuantity(current, item.itemId, Number(event.currentTarget.value)))
          }
          type="number"
          value={item.quantity}
        />
        <button
          aria-label={`Increase ${item.name}`}
          onClick={() => setState((current) => incrementOrderLineQuantity(current, item.itemId))}
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
        <button disabled={!state.submitBar.submitEnabled} type="button">
          {state.submitBar.submitLabel}
        </button>
      </footer>
    </main>
  );
}

function toActivationErrorReason(error: unknown): 'invalid_token' | 'expired_token' | 'network' | 'server' {
  if (error instanceof PortalApiError) {
    return error.kind;
  }

  return 'server';
}

function toOrderErrorMessage(error: unknown): string {
  if (error instanceof PortalApiError && error.kind === 'network') {
    return 'Connection is unstable. Check your signal and retry.';
  }

  return 'Unable to load order data right now. Please retry in a moment.';
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
