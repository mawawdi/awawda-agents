import type { CustomerPortalDataPayload, CustomerSessionActivateResponse } from '@meatland/shared-types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Input } from './components/ui/input';
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
let memoryPortalSession: StoredPortalSession | null = null;

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
        path="/m"
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
  const [searchParams] = useSearchParams();
  const token = (params.token ?? searchParams.get('token') ?? '').trim();
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
      <main className="status-screen" dir="rtl" lang="he">
        <Card className="status-card status-card-enter" data-kind="error">
          <h1>הפעלת הקישור נכשלה</h1>
          <p>{state.message}</p>
          <Button onClick={() => setState(createActivationIdleState(token))} size="lg" type="button">
            נסו להפעיל שוב
          </Button>
        </Card>
      </main>
    );
  }

  if (state.status === 'ready') {
    return (
      <main className="status-screen" dir="rtl" lang="he">
        <Card className="status-card status-card-enter" data-kind="ready">
          <h1>פותחים את ההזמנה שלך…</h1>
          <p>הסשן המאובטח מוכן.</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="status-screen" dir="rtl" lang="he">
      <Card className="status-card status-card-enter" data-kind="loading">
        <h1>מפעילים את קישור ההזמנה…</h1>
        <p>טוענים את פרטי החשבון שלך, רגע.</p>
        {state.status === 'activating' && state.weakNetworkHint ? (
          <p data-testid="activation-weak-network">זוהתה רשת איטית. השאירו את העמוד פתוח.</p>
        ) : null}
      </Card>
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
  const navigate = useNavigate();
  const [state, setState] = useState<OrderPageState>(createOrderLoadingState());
  const [submitState, setSubmitState] = useState<OrderSubmitState>(createIdleState());
  const [isLoggingOut, setIsLoggingOut] = useState(false);
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
        setState(createOrderErrorState('הסשן לא נמצא. פתחו שוב את קישור ההזמנה.'));
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
        if (error instanceof PortalApiError && (error.kind === 'invalid_token' || error.kind === 'expired_token')) {
          clearPortalSession();
          navigate('/m', { replace: true });
          return;
        }

        setState(createOrderErrorState(toOrderErrorMessage(error)));
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    },
    [apiClient, navigate, session, weakNetworkThresholdMs],
  );

  useEffect(() => {
    if (!session) {
      setState(createOrderErrorState('הסשן לא נמצא. פתחו שוב את קישור ההזמנה.'));
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
      setSubmitState(markSubmitError('לחלק מהשורות חסר מחיר. רעננו מחירים ונסו שוב.'));
      return;
    }

    if (submitLines.length === 0) {
      setSubmitState(markSubmitError('צריך להוסיף לפחות פריט אחד לפני השליחה.'));
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

      if (error instanceof PortalApiError && (error.kind === 'invalid_token' || error.kind === 'expired_token')) {
        clearPortalSession();
        navigate('/m', { replace: true });
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

  const handleLogout = async (): Promise<void> => {
    if (!session || isLoggingOut) {
      clearPortalSession();
      navigate('/m', { replace: true });
      return;
    }

    setIsLoggingOut(true);
    try {
      await apiClient.logoutSession(session.sessionToken);
    } catch {
      // logout should still clear local state and route user to activation
    } finally {
      clearPortalSession();
      submitIdempotencyKeyRef.current = null;
      setSubmitState(createIdleState());
      setIsLoggingOut(false);
      navigate('/m', { replace: true });
    }
  };

  if (state.status === 'loading') {
    return (
      <main className="status-screen" dir="rtl" lang="he">
        <Card className="status-card status-card-enter" data-kind="loading">
          <h1>טוענים את עמוד ההזמנה…</h1>
          {state.weakNetworkHint ? (
            <p data-testid="order-weak-network">הרשת איטית. התוכן יופיע מיד.</p>
          ) : (
            <p>מכינים את המחירים המעודכנים והקטלוג המאושר.</p>
          )}
        </Card>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="status-screen" dir="rtl" lang="he">
        <Card className="status-card status-card-enter" data-kind="error">
          <h1>לא הצלחנו לטעון את ההזמנה</h1>
          <p>{state.message}</p>
        </Card>
      </main>
    );
  }

  const renderItem = (item: OrderSectionItem): ReactElement => (
    <li className="item-card" key={item.itemId}>
        <h3 className="item-title">{item.name}</h3>
        <p className="item-pricing">
          {item.unitPrice === null
            ? 'המחיר לא זמין'
            : (
              <>
                <bdi dir="ltr">{formatCurrency(item.currency, item.unitPrice)}</bdi> / יחידה
              </>
            )}
        </p>
      <div className="qty-row">
        <Button
          aria-label={`הקטנת כמות ${item.name}`}
          className="qty-btn"
          disabled={state.isSubmitting || submitState.status === 'success'}
          onClick={() => adjustQuantity(item.itemId, 'decrement')}
          size="icon"
          type="button"
          variant="secondary"
        >
          −
        </Button>
        <Input
          aria-label={`כמות ${item.name}`}
          className="qty-input"
          disabled={state.isSubmitting || submitState.status === 'success'}
          inputMode="numeric"
          onChange={(event) => updateQuantity(item.itemId, Number(event.currentTarget.value))}
          type="number"
          value={item.quantity}
        />
        <Button
          aria-label={`הגדלת כמות ${item.name}`}
          className="qty-btn"
          disabled={state.isSubmitting || submitState.status === 'success'}
          onClick={() => adjustQuantity(item.itemId, 'increment')}
          size="icon"
          type="button"
          variant="secondary"
        >
          +
        </Button>
      </div>
    </li>
  );

  return (
    <main className="portal-shell" data-testid="portal-shell" dir="rtl" lang="he">
      <div className="portal-frame">
        <header className="portal-header">
          <div className="portal-brand-stack">
            <p className="portal-kicker">SALES APP</p>
            <h1 className="portal-brand" data-testid="portal-heading">MEATLAND</h1>
            <p className="portal-meta">
              לקוח: <bdi dir="ltr">{session?.customerId ?? 'unknown-customer'}</bdi> · סשן מאובטח
            </p>
          </div>
          <div className="portal-header-actions">
            <Badge className="layout-badge" data-testid="layout-state" variant="secondary">
              תצוגה: {state.layout === 'mobile' ? 'מובייל' : 'דסקטופ'}
            </Badge>
            <Button
              className="ghost-action"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
              size="sm"
              type="button"
              variant="subtle"
            >
              {isLoggingOut ? 'סוגרים סשן…' : 'התנתקות מהסשן'}
            </Button>
          </div>
        </header>

        <div className="portal-content">
          <section className="portal-column">
            <Card className="panel" data-section="recent">
              <div className="panel-heading">
                <h2>{state.sections.recent.title}</h2>
                <Badge className="panel-chip" variant="outline">קבועים</Badge>
              </div>
              {state.sections.recent.items.length === 0 ? (
                <p>{state.sections.recent.emptyMessage}</p>
              ) : (
                <ul className="items-list">{state.sections.recent.items.map(renderItem)}</ul>
              )}
            </Card>

            <Card className="panel" data-section="approved">
              <div className="panel-heading">
                <h2>{state.sections.approved.title}</h2>
                <Badge className="panel-chip" variant="outline">מאושר</Badge>
              </div>
              {state.sections.approved.items.length === 0 ? (
                <p>{state.sections.approved.emptyMessage}</p>
              ) : (
                <ul className="items-list">{state.sections.approved.items.map(renderItem)}</ul>
              )}
            </Card>
          </section>

          <aside className="portal-column">
            <Card aria-label="סיכום הזמנה" className="summary-card">
              <h2>סיכום הזמנה ואישור</h2>
              <div className="summary-line">
                <span>סה״כ יחידות: {state.cart.totalUnits}</span>
              </div>
              <div className="summary-line summary-total">
                <span>
                  סה״כ משוער: <bdi dir="ltr">{state.cart.estimatedTotal.toFixed(2)}</bdi>
                </span>
              </div>
              <div className="summary-line summary-total">
                <span>
                  סה״כ משוער ({state.cart.currency ? <bdi dir="ltr">{state.cart.currency}</bdi> : 'לא זמין'}):{' '}
                  <bdi dir="ltr">{formatCurrency(state.cart.currency, state.cart.estimatedTotal)}</bdi>
                </span>
              </div>
              <p>{state.submitBar.summaryLabel}</p>
              <p className="summary-microcopy">
                כפוף לשקילה סופית (משקל משתנה).
              </p>
              {state.cart.lines.length > 0 ? (
                <ul className="summary-lines">
                  {state.cart.lines.map((line) => (
                    <li className="summary-line" key={line.itemId}>
                      <span>{line.name}</span>
                      <span>
                        <bdi dir="ltr">{line.quantity}</bdi> ·{' '}
                        {line.lineEstimate === null
                          ? 'ממתין'
                          : <bdi dir="ltr">{formatCurrency(line.currency, line.lineEstimate)}</bdi>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>

            {submitState.status === 'mismatch' ? (
              <section aria-live="polite" className="feedback" data-kind="mismatch" data-testid="submit-mismatch">
                <h2>נמצאה אי-התאמה במחירים (Conflict 409)</h2>
                <p>בדקו את השורות שסומנו, ואז רעננו מחירים או אשרו מחדש את ההזמנה.</p>
                <ul>
                  {submitState.lines.map((line) => (
                    <li key={`${line.itemId}-${line.lineIndex}`}>
                      <bdi dir="ltr">{line.itemId}</bdi>: {line.reason}
                    </li>
                  ))}
                </ul>
                <div className="feedback-actions">
                  <Button onClick={() => void refreshAfterMismatch()} type="button" variant="secondary">
                    רענון מחירים
                  </Button>
                  <Button onClick={() => void handleSubmit(true)} type="button">
                    אישור מחדש ושליחה
                  </Button>
                </div>
              </section>
            ) : null}

            {submitState.status === 'error' ? (
              <section aria-live="polite" className="feedback" data-kind="error" data-testid="submit-error">
                <h2>שליחת ההזמנה נכשלה</h2>
                <p>{submitState.message}</p>
                <div className="feedback-actions">
                  <Button onClick={() => void handleSubmit()} type="button">
                    נסו לשלוח שוב
                  </Button>
                </div>
              </section>
            ) : null}

            {submitState.status === 'success' ? (
              <section aria-live="polite" className="feedback" data-kind="success" data-testid="submit-success">
                <h2>ההזמנה נקלטה בהצלחה!</h2>
                <p>
                  אסמכתא: <bdi dir="ltr">{submitState.orderRef}</bdi>
                </p>
                <p>ההזמנה אושרה. שליחה כפולה חסומה.</p>
              </section>
            ) : null}
          </aside>
        </div>

        <footer className="sticky-submit" data-testid="sticky-submit-bar">
          <p>{state.submitBar.summaryLabel}</p>
          <Button
            className="sticky-submit-button"
            disabled={!state.submitBar.submitEnabled || submitState.status === 'success' || submitState.status === 'mismatch'}
            onClick={() => void handleSubmit()}
            size="lg"
            type="button"
            variant="default"
          >
            {state.submitBar.submitLabel}
          </Button>
        </footer>
      </div>
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
    return 'החיבור לא יציב. בדקו קליטה ונסו שוב.';
  }

  return 'לא ניתן לטעון את נתוני ההזמנה כרגע. נסו שוב בעוד רגע.';
}

function toOrderSubmitErrorMessage(error: unknown): string {
  if (error instanceof PortalApiError) {
    if (error.kind === 'network') {
      return 'החיבור נותק בזמן השליחה. נסו שוב כדי לאשר את סטטוס ההזמנה.';
    }

    if (error.kind === 'erp_unavailable') {
      return 'ההזמנות זמנית לא זמינות בגלל תקלה ב-ERP. נסו שוב בעוד דקה באמצעות "נסו לשלוח שוב".';
    }

    if (error.kind === 'idempotency_conflict') {
      return 'מפתח השליחה פג תוקף. בדקו את הסל ושלחו שוב.';
    }
  }

  return 'לא ניתן לשלוח הזמנה כרגע. נסו שוב.';
}

function formatCurrency(currency: string | null, amount: number): string {
  if (!Number.isFinite(amount)) {
    return '—';
  }

  if (currency === 'ILS') {
    return `₪${amount.toFixed(2)}`;
  }

  if (!currency) {
    return amount.toFixed(2);
  }

  return `${currency} ${amount.toFixed(2)}`;
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
  memoryPortalSession = session;

  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Session storage may be unavailable in strict browser contexts.
  }
}

function clearPortalSession(): void {
  memoryPortalSession = null;

  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Session storage may be unavailable in strict browser contexts.
  }
}

function readPortalSession(): StoredPortalSession | null {
  let raw: string | null = null;

  try {
    raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    raw = null;
  }

  if (!raw) {
    return validateStoredSession(memoryPortalSession);
  }

  try {
    const parsed = JSON.parse(raw) as StoredPortalSession;
    return validateStoredSession(parsed);
  } catch {
    clearPortalSession();
    return null;
  }
}

function validateStoredSession(session: StoredPortalSession | null): StoredPortalSession | null {
  if (
    !session ||
    typeof session.sessionToken !== 'string' ||
    typeof session.customerId !== 'string' ||
    typeof session.sessionExpiresAt !== 'string' ||
    !session.payload ||
    typeof session.payload !== 'object'
  ) {
    clearPortalSession();
    return null;
  }

  if (new Date(session.sessionExpiresAt).getTime() <= Date.now()) {
    clearPortalSession();
    return null;
  }

  return session;
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
  clearPortalSession();
}

export function __setPortalSessionForTests(session: StoredPortalSession): void {
  memoryPortalSession = session;

  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // no-op
  }
}
