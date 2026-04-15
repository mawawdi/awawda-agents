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
import { PORTAL_SCREEN_TEST_IDS } from './portal-screen-ids';
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
const DEFAULT_MEDIA_ALT = 'תמונת מוצר אינה זמינה כרגע';
const TESTING_CUT_IMAGE_CACHE_BUSTER = 'testing-cuts-v4';
const TESTING_CUT_MIN_DIMENSION_PX = 512;
const PORTAL_CATALOG_GRID_GAP_PX = 14;
const PORTAL_CATALOG_SECTION_INSET_PX = 36;
const PORTAL_CATALOG_ROWS_PER_PAGE = 2;
const PORTAL_API_BASE_URL = resolvePortalApiBaseUrl();

type ItemSpecies = 'beef' | 'chicken' | 'lamb';

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
      <main className="status-shell" data-testid={PORTAL_SCREEN_TEST_IDS.sessionError} dir="rtl" lang="he">
        <header className="status-top-nav">
          <div className="status-top-brand">MEATLAND</div>
        </header>
        <section className="status-main-grid">
          <div className="status-visual-pane">
            <DeterministicPlaceholder
              className="status-visual-placeholder"
              label="Meatland"
              seed="activation-error-visual"
            />
            <div className="status-visual-copy">
              <p>איכות ללא פשרות</p>
              <h2>מצוינות בכל נתח</h2>
            </div>
          </div>
          <Card className="status-content-pane">
            <div className="status-icon-bubble" aria-hidden="true">!</div>
            <h1>שגיאת הפעלה</h1>
            <p>{state.message}</p>
            <Button onClick={() => setState(createActivationIdleState(token))} size="lg" type="button">
              נסה הפעלה מחדש
            </Button>
            <div className="status-support-pane">
              <p>זקוק לעזרה?</p>
              <p>צור קשר עם מוקד הפרימיום שלנו לקבלת סיוע אישי.</p>
            </div>
          </Card>
        </section>
      </main>
    );
  }

  if (state.status === 'ready') {
    return (
      <main className="status-screen" dir="rtl" lang="he">
        <Card className="status-card status-card-enter" data-kind="ready">
          <h1>פותחים את ההזמנה שלך…</h1>
          <p>הכול מוכן להזמנה שלך.</p>
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
  const [hiddenItemImageIds, setHiddenItemImageIds] = useState<Record<string, true>>({});
  const [catalogViewportWidth, setCatalogViewportWidth] = useState(0);
  const [recentCatalogPage, setRecentCatalogPage] = useState(1);
  const [approvedCatalogPage, setApprovedCatalogPage] = useState(1);
  const session = useMemo(() => readPortalSession(), []);
  const submitIdempotencyKeyRef = useRef<string | null>(null);
  const catalogMeasureRef = useRef<HTMLDivElement | null>(null);

  const markItemImageUnavailable = useCallback((itemId: string): void => {
    setHiddenItemImageIds((current) => {
      if (current[itemId]) {
        return current;
      }
      return {
        ...current,
        [itemId]: true,
      };
    });
  }, []);

  useEffect(() => {
    setHiddenItemImageIds({});
    setRecentCatalogPage(1);
    setApprovedCatalogPage(1);
  }, [session?.customerId]);

  useEffect(() => {
    const element = catalogMeasureRef.current;
    if (!element) {
      return;
    }

    const updateWidth = (nextRawWidth: number): void => {
      const normalized = Math.max(0, Math.floor(nextRawWidth) - PORTAL_CATALOG_SECTION_INSET_PX);
      setCatalogViewportWidth((current) => (current === normalized ? current : normalized));
    };

    updateWidth(element.clientWidth);

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const nextWidth = entries[0]?.contentRect.width ?? element.clientWidth;
        updateWidth(nextWidth);
      });
      observer.observe(element);
      return () => observer.disconnect();
    }

    const handleWindowResize = (): void => {
      updateWidth(element.clientWidth);
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [state.status]);

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
        setState(createOrderErrorState('לא הצלחנו לזהות את ההזמנה. פתחו שוב את קישור ההזמנה.'));
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
      setState(createOrderErrorState('לא הצלחנו לזהות את ההזמנה. פתחו שוב את קישור ההזמנה.'));
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

  const catalogColumnCount = resolveCatalogGridColumnCount(catalogViewportWidth, TESTING_CUT_MIN_DIMENSION_PX, PORTAL_CATALOG_GRID_GAP_PX);
  const catalogImageDimension = resolveCatalogGridCellDimension(
    catalogViewportWidth,
    catalogColumnCount,
    TESTING_CUT_MIN_DIMENSION_PX,
    PORTAL_CATALOG_GRID_GAP_PX,
  );
  const catalogPageSize = Math.max(catalogColumnCount * PORTAL_CATALOG_ROWS_PER_PAGE, 1);
  const recentTotalPages = Math.max(1, Math.ceil(state.sections.recent.items.length / catalogPageSize));
  const approvedTotalPages = Math.max(1, Math.ceil(state.sections.approved.items.length / catalogPageSize));
  const activeRecentPage = Math.min(recentCatalogPage, recentTotalPages);
  const activeApprovedPage = Math.min(approvedCatalogPage, approvedTotalPages);
  const pagedRecentItems = state.sections.recent.items.slice(
    (activeRecentPage - 1) * catalogPageSize,
    activeRecentPage * catalogPageSize,
  );
  const pagedApprovedItems = state.sections.approved.items.slice(
    (activeApprovedPage - 1) * catalogPageSize,
    activeApprovedPage * catalogPageSize,
  );
  const catalogGridStyle = { gridTemplateColumns: `repeat(${catalogColumnCount}, minmax(0, 1fr))` };
  const catalogImageStyle = { height: `${catalogImageDimension}px` };

  const renderItem = (item: OrderSectionItem): ReactElement => {
    const imageUrl = hiddenItemImageIds[item.itemId] ? null : buildTestingItemImageUrl(item.itemId);
    const species = inferItemSpecies(item.itemId);

    return (
      <li className="item-card" key={item.itemId}>
        <div className="item-image-wrap" style={catalogImageStyle}>
          <DeterministicPlaceholder className="item-image-placeholder" label={item.name} seed={item.itemId} />
          {imageUrl ? (
            <img
              alt={item.name}
              className="item-image-asset"
              decoding="async"
              loading="lazy"
              onError={() => markItemImageUnavailable(item.itemId)}
              src={imageUrl}
            />
          ) : null}
          {species ? (
            <span className={`species-badge species-badge--${species}`} aria-hidden="true">
              <SpeciesIcon species={species} />
            </span>
          ) : null}
        </div>
        <div className="item-content">
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
        </div>
      </li>
    );
  };

  const itemNameById = new Map(state.cart.lines.map((line) => [line.itemId, line.name]));
  const customerLabel = humanizeIdentifier(session?.customerId ?? 'unknown-customer', 'cust-');
  const subtotal = state.cart.estimatedTotal;
  const logisticsFee = 0;
  const submitLocked = submitState.status === 'success';

  return (
    <main className="portal-shell" data-testid={PORTAL_SCREEN_TEST_IDS.orderComposer} dir="rtl" lang="he">
      <header className="portal-top-nav">
        <div className="portal-top-brand" data-testid="portal-heading">Meatland</div>
        <nav className="portal-top-links" aria-hidden="true">
          <span>לוח בקרה</span>
          <span>היסטוריית הזמנות</span>
          <span className="is-active">מחירון</span>
          <span>תמיכה</span>
        </nav>
        <div className="portal-top-actions">
          <div className="portal-session-chip" aria-hidden="true">
            <span>חשבון מאומת</span>
            <DeterministicPlaceholder className="portal-avatar-placeholder" label={customerLabel} seed={customerLabel} />
          </div>
          <Button
            className="ghost-action"
            disabled={isLoggingOut}
            onClick={() => void handleLogout()}
            size="sm"
            type="button"
            variant="subtle"
          >
            {isLoggingOut ? 'מתנתקים…' : 'התנתקות'}
          </Button>
        </div>
      </header>
      <div className="portal-layout">
        <aside className="portal-side-nav">
          <div className="portal-side-heading">
            <h2>מרכז ההזמנה</h2>
            <p>בחירה מובחרת</p>
            <p>לקוח פעיל: {customerLabel}</p>
          </div>
        </aside>
        <div className="portal-main-content" ref={catalogMeasureRef}>
          <section className="hero-banner">
            <DeterministicPlaceholder className="hero-media" label="השקת העונה" seed="seasonal-release" />
            <div className="hero-overlay">
              <span>השקת העונה</span>
              <h1>ריזרב פרימיום מיושן</h1>
              <p>נתחים מיושנים 45 יום במלח הימלאיה זמינים כעת להזמנה סיטונאית מוקדמת.</p>
            </div>
          </section>
          <section className="catalog-section">
            <div className="panel-heading">
              <h2>{state.sections.recent.title}</h2>
              <Badge className="panel-chip" variant="outline">הזמנות אחרונות</Badge>
            </div>
            {state.sections.recent.items.length === 0 ? (
              <p>{state.sections.recent.emptyMessage}</p>
            ) : (
              <>
                <ul className="items-list" style={catalogGridStyle}>{pagedRecentItems.map(renderItem)}</ul>
                {recentTotalPages > 1 ? (
                  <div className="catalog-pagination">
                    <Button
                      disabled={activeRecentPage <= 1}
                      onClick={() => setRecentCatalogPage((current) => Math.max(1, current - 1))}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      הקודם
                    </Button>
                    <span>עמוד {activeRecentPage} מתוך {recentTotalPages}</span>
                    <Button
                      disabled={activeRecentPage >= recentTotalPages}
                      onClick={() => setRecentCatalogPage((current) => Math.min(recentTotalPages, current + 1))}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      הבא
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </section>
          <section className="catalog-section">
            <div className="panel-heading">
              <h2>{state.sections.approved.title}</h2>
              <Badge className="panel-chip" variant="outline">מוצרים מאושרים</Badge>
            </div>
            {state.sections.approved.items.length === 0 ? (
              <p>{state.sections.approved.emptyMessage}</p>
            ) : (
              <>
                <ul className="items-list" style={catalogGridStyle}>{pagedApprovedItems.map(renderItem)}</ul>
                {approvedTotalPages > 1 ? (
                  <div className="catalog-pagination">
                    <Button
                      disabled={activeApprovedPage <= 1}
                      onClick={() => setApprovedCatalogPage((current) => Math.max(1, current - 1))}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      הקודם
                    </Button>
                    <span>עמוד {activeApprovedPage} מתוך {approvedTotalPages}</span>
                    <Button
                      disabled={activeApprovedPage >= approvedTotalPages}
                      onClick={() => setApprovedCatalogPage((current) => Math.min(approvedTotalPages, current + 1))}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      הבא
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
        <aside className="summary-rail">
          <Card aria-label="סיכום הזמנה" className="summary-card">
            <h2>סיכום הזמנה</h2>
            <div className="summary-line">
              <span>פריטים</span>
              <span>
                <bdi dir="ltr">{state.cart.totalUnits}</bdi>
              </span>
            </div>
            <div className="summary-line">
              <span>סכום ביניים</span>
              <span>
                <bdi dir="ltr">{formatCurrency(state.cart.currency, subtotal)}</bdi>
              </span>
            </div>
            <div className="summary-line">
              <span>דמי לוגיסטיקה</span>
              <span>
                <bdi dir="ltr">{formatCurrency(state.cart.currency, logisticsFee)}</bdi>
              </span>
            </div>
            <div className="summary-line summary-total">
              <span>סכום כולל</span>
              <span>
                <bdi dir="ltr">{formatCurrency(state.cart.currency, state.cart.estimatedTotal)}</bdi>
              </span>
            </div>
            <p className="summary-microcopy">המחירים אינם כוללים מע״מ, לפי הצורך.</p>
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
            {submitState.status === 'success' ? <p className="success-lock-copy">ההזמנה ננעלה לאחר אישור כדי למנוע שליחה כפולה.</p> : null}
          </Card>

          {submitState.status === 'mismatch' ? (
            <section
              aria-live="polite"
              className="feedback"
              data-kind="mismatch"
              data-testid={PORTAL_SCREEN_TEST_IDS.orderMismatch}
            >
              <h2>נמצאו פערי מחיר בהזמנה</h2>
              <p>המחירים עודכנו מאז הוספת המוצרים לסל. עברו על העדכונים לפני המשך ההזמנה.</p>
              <ul>
                {submitState.lines.map((line) => (
                  <li key={`${line.itemId}-${line.lineIndex}`}>
                    {itemNameById.get(line.itemId) ?? humanizeIdentifier(line.itemId, 'itm-')}: {line.reason}
                  </li>
                ))}
              </ul>
              <div className="feedback-actions">
                <Button onClick={() => void refreshAfterMismatch()} type="button" variant="secondary">
                  עדכון מחירים
                </Button>
                <Button onClick={() => void handleSubmit(true)} type="button">
                  אשר ושדר הזמנה
                </Button>
              </div>
            </section>
          ) : null}

          {submitState.status === 'error' ? (
            <section aria-live="polite" className="feedback" data-kind="error" data-testid="submit-error">
              <h2>לא הצלחנו לשלוח את ההזמנה</h2>
              <p>{submitState.message}</p>
              <div className="feedback-actions">
                <Button onClick={() => void handleSubmit()} type="button">
                  נסו לשלוח שוב
                </Button>
              </div>
            </section>
          ) : null}

          {submitState.status === 'success' ? (
            <section aria-live="polite" className="feedback success-panel" data-kind="success" data-testid={PORTAL_SCREEN_TEST_IDS.orderSuccess}>
              <h2>ההזמנה נקלטה בהצלחה!</h2>
              <p>
                אסמכתא: <bdi dir="ltr">{submitState.orderRef}</bdi>
              </p>
              <p>תודה שבחרת ב-Meatland. הצוות שלנו כבר התחיל בטיפול בנתחים המובחרים שלך.</p>
              <div className="success-metrics-grid">
                <div className="success-metric-card">
                  <span className="success-metric-label">מספר הזמנה</span>
                  <span className="success-metric-value">
                    <bdi dir="ltr">{submitState.orderRef}</bdi>
                  </span>
                </div>
                <div className="success-metric-card">
                  <span className="success-metric-label">סה״כ לתשלום</span>
                  <span className="success-metric-value">
                    <bdi dir="ltr">{formatCurrency(state.cart.currency, state.cart.estimatedTotal)}</bdi>
                  </span>
                </div>
                <div className="success-metric-card">
                  <span className="success-metric-label">מועד משלוח משוער</span>
                  <span className="success-metric-value">יום שלישי, 24 באוקטובר</span>
                </div>
                <div className="success-metric-card">
                  <span className="success-metric-label">סטטוס משלוח</span>
                  <span className="success-metric-value success-metric-value-secondary">מעובד במפעל</span>
                </div>
              </div>
              <p className="success-lock-copy">ההזמנה ננעלה לאחר אישור כדי למנוע שליחה כפולה.</p>
            </section>
          ) : null}
        </aside>
      </div>
      <footer className="sticky-submit" data-testid="sticky-submit-bar">
        <p>{state.submitBar.summaryLabel}</p>
        <Button
          className="sticky-submit-button"
          disabled={!state.submitBar.submitEnabled || submitLocked || submitState.status === 'mismatch'}
          onClick={() => void handleSubmit()}
          size="lg"
          type="button"
          variant="default"
        >
          {state.submitBar.submitLabel}
        </Button>
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
      return 'המערכת עמוסה זמנית ולא ניתן להשלים את ההזמנה כרגע. נסו שוב בעוד דקה באמצעות "נסו לשלוח שוב".';
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

function humanizeIdentifier(value: string, prefix: string): string {
  const normalized = value.startsWith(prefix) ? value.slice(prefix.length) : value;
  return normalized
    .split('-')
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function buildTestingItemImageUrl(itemId: string): string | null {
  const normalized = itemId.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return `${PORTAL_API_BASE_URL}/testing-assets/items/${encodeURIComponent(normalized)}/image?v=${TESTING_CUT_IMAGE_CACHE_BUSTER}`;
}

function inferItemSpecies(itemId: string): ItemSpecies | null {
  const normalized = itemId.trim().toLowerCase();
  if (normalized.includes('beef')) {
    return 'beef';
  }
  if (normalized.includes('chicken')) {
    return 'chicken';
  }
  if (normalized.includes('lamb')) {
    return 'lamb';
  }
  return null;
}

function resolveCatalogGridColumnCount(containerWidth: number, minDimension: number, gap: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil((containerWidth + gap) / (minDimension + gap)));
}

function resolveCatalogGridCellDimension(containerWidth: number, columns: number, minDimension: number, gap: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0 || columns <= 0) {
    return minDimension;
  }

  const totalGap = gap * Math.max(0, columns - 1);
  const cellDimension = Math.floor((containerWidth - totalGap) / columns);
  return Math.max(1, Math.min(minDimension, cellDimension));
}

function resolvePortalApiBaseUrl(): string {
  const baseUrl = (globalThis as { __CUSTOMER_PORTAL_API_BASE_URL__?: string }).__CUSTOMER_PORTAL_API_BASE_URL__ ?? '/v1';
  return baseUrl.trim().replace(/\/+$/g, '');
}

function DeterministicPlaceholder({
  className,
  label,
  seed,
}: {
  className: string;
  label: string;
  seed: string;
}): ReactElement {
  const hue = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  const accentHue = (hue + 42) % 360;
  const bg = `linear-gradient(140deg, hsl(${hue} 32% 20%), hsl(${(hue + 28) % 360} 36% 36%))`;
  const texture = [
    `radial-gradient(circle at 18% 20%, hsl(${accentHue} 64% 58% / 0.24), transparent 52%)`,
    `radial-gradient(circle at 82% 84%, hsl(${(accentHue + 70) % 360} 72% 62% / 0.2), transparent 46%)`,
    `repeating-linear-gradient(35deg, hsl(${hue} 50% 12% / 0.08) 0 14px, hsl(${(hue + 16) % 360} 38% 94% / 0.02) 14px 26px)`,
  ].join(', ');
  const initials = label
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase())
    .join('');

  return (
    <div
      aria-label={DEFAULT_MEDIA_ALT}
      className={className}
      role="img"
      style={{
        backgroundImage: `${texture}, ${bg}`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }}
      title={label}
    >
      <span>{initials || 'ML'}</span>
    </div>
  );
}

function SpeciesIcon({ species }: { species: ItemSpecies }): ReactElement {
  if (species === 'beef') {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path
          d="M7 8L4 5l1.2-2L8.5 5h7L18.8 3 20 5l-3 3v6.2A2.8 2.8 0 0 1 14.2 17H9.8A2.8 2.8 0 0 1 7 14.2V8Zm2.3 2.7a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm5.4 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4ZM9.4 14.4h5.2a1 1 0 0 1 0 2H9.4a1 1 0 1 1 0-2Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (species === 'lamb') {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path
          d="M8.7 16.5A4.7 4.7 0 1 1 9 7h.3A4.2 4.2 0 0 1 17 8.7a3.8 3.8 0 1 1 .5 7.5h-8.8Zm2.4-1.6h1.8a2.5 2.5 0 0 0 0-5h-1.8a2.5 2.5 0 0 0 0 5Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="M6.8 15.5a4.8 4.8 0 0 1 5.5-7.4c1.2.3 2.3.9 3 1.8l2.3-.7c.8-.2 1.4.6 1 1.3l-1.2 2.2c.2.5.3 1 .3 1.5A4.8 4.8 0 0 1 13 19h-1.8a4.4 4.4 0 0 1-4.4-3.5Zm5.7-9.3 1-2.2 1.6 1.4-.8 1.7h-1.8Z"
        fill="currentColor"
      />
    </svg>
  );
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
