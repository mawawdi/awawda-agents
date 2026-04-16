import type { CustomerPortalDataPayload, CustomerSessionActivateResponse } from '@awawda/shared-types';
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

type RecentOrderLine = {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: 'kg' | 'unit';
};

type RecentOrderEntry = {
  compositionSignature: string;
  lines: RecentOrderLine[];
  lastOrderedAt: string | null;
  orderCount: number;
  canLoadIntoCart: boolean;
};

type RecentOrdersFeed = {
  entries: RecentOrderEntry[];
  total: number;
  pageSize: number;
  generatedAt: string | null;
  windowStartAt: string | null;
};

const SESSION_STORAGE_KEY = 'customer-portal-session';
const WEAK_NETWORK_THRESHOLD_MS = 2_500;
let memoryPortalSession: StoredPortalSession | null = null;
const DEFAULT_MEDIA_ALT = 'תמונת מוצר אינה זמינה כרגע';
const TESTING_CUT_IMAGE_CACHE_BUSTER = 'testing-cuts-v4';
const TESTING_CUT_MIN_DIMENSION_PX = 512;
const PORTAL_CATALOG_GRID_GAP_PX = 14;
const PORTAL_CATALOG_SECTION_INSET_PX = 36;
const PORTAL_CATALOG_ROWS_PER_PAGE = 3;
const MOBILE_CATALOG_GRID_COLUMNS = 3;
const WIDE_CATALOG_GRID_COLUMNS = 4;
const TABLET_MIN_VIEWPORT_WIDTH = 768;
const TWO_DECIMAL_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const PORTAL_API_BASE_URL = resolvePortalApiBaseUrl();
const RECENT_ORDER_MOBILE_PAGE_SIZE = 3;
const RECENT_ORDER_DESKTOP_PAGE_SIZE = 4;
const EMPTY_RECENT_ORDERS_FEED: RecentOrdersFeed = {
  entries: [],
  total: 0,
  pageSize: RECENT_ORDER_DESKTOP_PAGE_SIZE,
  generatedAt: null,
  windowStartAt: null,
};

type ItemSpecies = 'beef' | 'chicken' | 'lamb';

const SPECIES_ICON_PATH_BY_SPECIES: Record<ItemSpecies, string> = {
  beef:
    'M10.5,18A0.5,0.5 0 0,1 11,18.5A0.5,0.5 0 0,1 10.5,19A0.5,0.5 0 0,1 10,18.5A0.5,0.5 0 0,1 10.5,18M13.5,18A0.5,0.5 0 0,1 14,18.5A0.5,0.5 0 0,1 13.5,19A0.5,0.5 0 0,1 13,18.5A0.5,0.5 0 0,1 13.5,18M10,11A1,1 0 0,1 11,12A1,1 0 0,1 10,13A1,1 0 0,1 9,12A1,1 0 0,1 10,11M14,11A1,1 0 0,1 15,12A1,1 0 0,1 14,13A1,1 0 0,1 13,12A1,1 0 0,1 14,11M18,18C18,20.21 15.31,22 12,22C8.69,22 6,20.21 6,18C6,17.1 6.45,16.27 7.2,15.6C6.45,14.6 6,13.35 6,12L6.12,10.78C5.58,10.93 4.93,10.93 4.4,10.78C3.38,10.5 1.84,9.35 2.07,8.55C2.3,7.75 4.21,7.6 5.23,7.9C5.82,8.07 6.45,8.5 6.82,8.96L7.39,8.15C6.79,7.05 7,4 10,3L9.91,3.14V3.14C9.63,3.58 8.91,4.97 9.67,6.47C10.39,6.17 11.17,6 12,6C12.83,6 13.61,6.17 14.33,6.47C15.09,4.97 14.37,3.58 14.09,3.14L14,3C17,4 17.21,7.05 16.61,8.15L17.18,8.96C17.55,8.5 18.18,8.07 18.77,7.9C19.79,7.6 21.7,7.75 21.93,8.55C22.16,9.35 20.62,10.5 19.6,10.78C19.07,10.93 18.42,10.93 17.88,10.78L18,12C18,13.35 17.55,14.6 16.8,15.6C17.55,16.27 18,17.1 18,18M12,16C9.79,16 8,16.9 8,18C8,19.1 9.79,20 12,20C14.21,20 16,19.1 16,18C16,16.9 14.21,16 12,16M12,14C13.12,14 14.17,14.21 15.07,14.56C15.65,13.87 16,13 16,12A4,4 0 0,0 12,8A4,4 0 0,0 8,12C8,13 8.35,13.87 8.93,14.56C9.83,14.21 10.88,14 12,14M14.09,3.14V3.14Z',
  chicken:
    'M23 11.5L19.95 10.37C19.69 9.22 19.04 8.56 19.04 8.56C17.4 6.92 14.75 6.92 13.11 8.56L11.63 10.04L5 3C4 7 5 11 7.45 14.22L2 19.5C2 19.5 10.89 21.5 16.07 17.45C18.83 15.29 19.45 14.03 19.84 12.7L23 11.5M17.71 11.72C17.32 12.11 16.68 12.11 16.29 11.72C15.9 11.33 15.9 10.7 16.29 10.31C16.68 9.92 17.32 9.92 17.71 10.31C18.1 10.7 18.1 11.33 17.71 11.72Z',
  lamb:
    'M20,8.5A2.5,2.5 0 0,1 17.5,11C16.42,11 15.5,10.31 15.16,9.36C14.72,9.75 14.14,10 13.5,10C12.94,10 12.42,9.81 12,9.5C11.58,9.81 11.07,10 10.5,10C9.86,10 9.28,9.75 8.84,9.36C8.5,10.31 7.58,11 6.5,11A2.5,2.5 0 0,1 4,8.5C4,7.26 4.91,6.23 6.1,6.04C6.04,5.87 6,5.69 6,5.5A1.5,1.5 0 0,1 7.5,4C7.7,4 7.89,4.04 8.06,4.11C8.23,3.47 8.81,3 9.5,3C9.75,3 10,3.07 10.18,3.17C10.5,2.5 11.19,2 12,2C12.81,2 13.5,2.5 13.82,3.17C14,3.07 14.25,3 14.5,3C15.19,3 15.77,3.47 15.94,4.11C16.11,4.04 16.3,4 16.5,4A1.5,1.5 0 0,1 18,5.5C18,5.69 17.96,5.87 17.9,6.04C19.09,6.23 20,7.26 20,8.5M10,12A1,1 0 0,0 9,13A1,1 0 0,0 10,14A1,1 0 0,0 11,13A1,1 0 0,0 10,12M14,12A1,1 0 0,0 13,13A1,1 0 0,0 14,14A1,1 0 0,0 15,13A1,1 0 0,0 14,12M20.23,10.66C19.59,11.47 18.61,12 17.5,12C17.05,12 16.62,11.9 16.21,11.73C16.2,14.28 15.83,17.36 14.45,18.95C13.93,19.54 13.3,19.86 12.5,19.96V18H11.5V19.96C10.7,19.86 10.07,19.55 9.55,18.95C8.16,17.35 7.79,14.29 7.78,11.74C7.38,11.9 6.95,12 6.5,12C5.39,12 4.41,11.47 3.77,10.66C2.88,11.55 2,12 2,12C2,12 3,14 5,14C5.36,14 5.64,13.96 5.88,13.91C6.22,17.73 7.58,22 12,22C16.42,22 17.78,17.73 18.12,13.91C18.36,13.96 18.64,14 19,14C21,14 22,12 22,12C22,12 21.12,11.55 20.23,10.66Z',
};

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
      <main className="status-screen portal-not-found-screen" data-testid={PORTAL_SCREEN_TEST_IDS.sessionError} dir="rtl" lang="he">
        <Card className="status-card status-card-enter portal-not-found-card" data-kind="error">
          <p className="portal-not-found-code">404</p>
          <h1>העמוד לא נמצא</h1>
          <p>{state.message}</p>
          <Button onClick={() => setState(createActivationIdleState(token))} size="lg" type="button">
            נסו שוב
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
  const [hiddenItemImageIds, setHiddenItemImageIds] = useState<Record<string, true>>({});
  const [catalogViewportWidth, setCatalogViewportWidth] = useState(0);
  const [recentOrdersFeed, setRecentOrdersFeed] = useState<RecentOrdersFeed>(EMPTY_RECENT_ORDERS_FEED);
  const [recentOrdersPage, setRecentOrdersPage] = useState(1);
  const [approvedCatalogPage, setApprovedCatalogPage] = useState(1);
  const [successCapturedAt, setSuccessCapturedAt] = useState<string | null>(null);
  const [recentlyCopiedOrderRef, setRecentlyCopiedOrderRef] = useState<string | null>(null);
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
    setRecentOrdersFeed(normalizeRecentOrdersFeed(session?.payload?.recentOrders));
    setRecentOrdersPage(1);
    setApprovedCatalogPage(1);
    setSuccessCapturedAt(null);
    setRecentlyCopiedOrderRef(null);
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
    submitIdempotencyKeyRef.current = null;
    setSuccessCapturedAt(null);
    setRecentlyCopiedOrderRef(null);
    setSubmitState(createIdleState());
  }, []);

  const copyOrderReference = useCallback(async (orderRef: string): Promise<void> => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(orderRef);
      setRecentlyCopiedOrderRef(orderRef);
      window.setTimeout(() => {
        setRecentlyCopiedOrderRef((current) => (current === orderRef ? null : current));
      }, 1_500);
    } catch {
      setRecentlyCopiedOrderRef(null);
    }
  }, []);

  const loadRecentOrderIntoCart = useCallback(
    (entry: RecentOrderEntry): void => {
      if (!entry.canLoadIntoCart) {
        return;
      }

      setState((current) => {
        if (current.status !== 'ready') {
          return current;
        }

        const nextQuantityByItemId = new Map<string, number>();
        for (const item of current.sections.recent.items) {
          nextQuantityByItemId.set(item.itemId, 0);
        }
        for (const item of current.sections.approved.items) {
          if (!nextQuantityByItemId.has(item.itemId)) {
            nextQuantityByItemId.set(item.itemId, 0);
          }
        }

        for (const line of entry.lines) {
          if (!nextQuantityByItemId.has(line.itemId)) {
            continue;
          }
          nextQuantityByItemId.set(line.itemId, (nextQuantityByItemId.get(line.itemId) ?? 0) + line.quantity);
        }

        let nextState: OrderPageState = current;
        for (const [itemId, quantity] of nextQuantityByItemId.entries()) {
          nextState = setOrderLineQuantity(nextState, itemId, quantity);
        }

        return nextState;
      });

      resetSubmitDraft();
    },
    [resetSubmitDraft],
  );

  const loadPortalData = useCallback(
    async (preservedQuantities: Record<string, number> = {}): Promise<void> => {
      if (!session) {
        setState(createOrderErrorState('לא הצלחנו לזהות את ההזמנה. פתחו שוב את קישור ההזמנה.'));
        setRecentOrdersFeed(EMPTY_RECENT_ORDERS_FEED);
        return;
      }

      let timer: ReturnType<typeof setTimeout> | undefined;
      setState(createOrderLoadingState());
      timer = setTimeout(() => {
        setState((current) => markOrderLoadingWeakNetwork(current));
      }, weakNetworkThresholdMs);

      try {
        const payload = await apiClient.getPortalData(session.sessionToken);
        const normalizedRecentOrders = normalizeRecentOrdersFeed((payload as { recentOrders?: unknown }).recentOrders);
        writePortalSession({ ...payload, sessionToken: session.sessionToken });
        setRecentOrdersFeed(normalizedRecentOrders);
        setState(
          createOrderReadyState({
            ...toOrderInput(payload),
            initialQuantities: preservedQuantities,
          }),
        );
      } catch (error) {
        if (error instanceof PortalApiError && (error.kind === 'invalid_token' || error.kind === 'expired_token')) {
          clearPortalSession();
          setRecentOrdersFeed(EMPTY_RECENT_ORDERS_FEED);
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
    setState((current) => setOrderLineQuantity(current, itemId, nextQuantity));
    resetSubmitDraft();
  };

  const adjustQuantity = (itemId: string, direction: 'increment' | 'decrement'): void => {
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
      setSuccessCapturedAt(formatPortalDateTime());
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

  const catalogColumnCount = resolveCatalogGridColumnCount(catalogViewportWidth);
  const catalogCellDimension = resolveCatalogGridCellDimension(catalogViewportWidth, catalogColumnCount);
  const catalogImageMinDimension = state.layout === 'mobile' ? 72 : 96;
  const catalogImageDimension = Math.max(
    catalogImageMinDimension,
    Math.floor(catalogCellDimension * (catalogColumnCount >= 4 ? 0.72 : 0.74)),
  );
  const catalogMetaFontSize = resolveCatalogMetaFontSize(catalogCellDimension);
  const catalogMetaLineHeight = Math.round(catalogMetaFontSize * 1.25);
  const catalogPageSize = Math.max(catalogColumnCount * PORTAL_CATALOG_ROWS_PER_PAGE, 1);
  const recentOrdersPageSize = state.layout === 'mobile' ? RECENT_ORDER_MOBILE_PAGE_SIZE : RECENT_ORDER_DESKTOP_PAGE_SIZE;
  const recentOrdersTotalPages = Math.max(1, Math.ceil(recentOrdersFeed.entries.length / recentOrdersPageSize));
  const approvedTotalPages = Math.max(1, Math.ceil(state.sections.approved.items.length / catalogPageSize));
  const activeRecentOrdersPage = Math.min(recentOrdersPage, recentOrdersTotalPages);
  const activeApprovedPage = Math.min(approvedCatalogPage, approvedTotalPages);
  const pagedRecentOrders = recentOrdersFeed.entries.slice(
    (activeRecentOrdersPage - 1) * recentOrdersPageSize,
    activeRecentOrdersPage * recentOrdersPageSize,
  );
  const pagedApprovedItems = state.sections.approved.items.slice(
    (activeApprovedPage - 1) * catalogPageSize,
    activeApprovedPage * catalogPageSize,
  );
  const catalogGridStyle = { gridTemplateColumns: `repeat(${catalogColumnCount}, minmax(0, 1fr))` };
  const catalogImageStyle = { height: `${catalogImageDimension}px` };

  const renderItem = (item: OrderSectionItem): ReactElement => {
    const itemDisplayName = resolvePortalItemDisplayName(item.itemId, item.name);
    const titleLayout = resolveCatalogTitleLayout(catalogCellDimension, itemDisplayName);
    const imageUrl = hiddenItemImageIds[item.itemId] ? null : buildTestingItemImageUrl(item.itemId);
    const species = inferItemSpecies(item.itemId);

    return (
      <li className="item-card" key={item.itemId}>
        <div className="item-image-wrap" style={catalogImageStyle}>
          <DeterministicPlaceholder className="item-image-placeholder" label={itemDisplayName} seed={item.itemId} />
          {imageUrl ? (
            <img
              alt={itemDisplayName}
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
          <h3
            className="item-title"
            style={{
              fontSize: `${titleLayout.fontSize}px`,
              lineHeight: `${titleLayout.lineHeight}px`,
              minHeight: `${titleLayout.minHeight}px`,
              WebkitLineClamp: titleLayout.maxLines,
            }}
          >
            {itemDisplayName}
          </h3>
          <p className="item-pricing" style={{ fontSize: `${catalogMetaFontSize}px`, lineHeight: `${catalogMetaLineHeight}px` }}>
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
              aria-label={`הקטנת כמות ${itemDisplayName}`}
              className="qty-btn"
              disabled={state.isSubmitting}
              onClick={() => adjustQuantity(item.itemId, 'decrement')}
              size="icon"
              type="button"
              variant="secondary"
            >
              −
            </Button>
            <Input
              aria-label={`כמות ${itemDisplayName}`}
              className="qty-input"
              disabled={state.isSubmitting}
              inputMode="numeric"
              onChange={(event) => updateQuantity(item.itemId, Number(event.currentTarget.value))}
              type="number"
              value={item.quantity}
            />
            <Button
              aria-label={`הגדלת כמות ${itemDisplayName}`}
              className="qty-btn"
              disabled={state.isSubmitting}
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

  const renderRecentOrderCard = (entry: RecentOrderEntry, entryIndex: number): ReactElement => {
    const orderSequence = (activeRecentOrdersPage - 1) * recentOrdersPageSize + entryIndex + 1;
    const renderedLines = entry.lines.slice(0, 3);

    return (
      <li className="recent-order-item" key={`${entry.compositionSignature}-${orderSequence}`}>
        <button
          className="recent-order-card"
          data-testid={`recent-order-card-${orderSequence}`}
          disabled={!entry.canLoadIntoCart || state.isSubmitting}
          onClick={() => loadRecentOrderIntoCart(entry)}
          type="button"
        >
          <div className="recent-order-card-header">
            <span className="recent-order-card-chip">הזמנה {orderSequence}</span>
            <span className="recent-order-card-date">{formatRecentOrderDate(entry.lastOrderedAt)}</span>
          </div>
          <p className="recent-order-card-meta">בוצעה {entry.orderCount} פעמים</p>
          {renderedLines.length > 0 ? (
            <ul className="recent-order-lines">
              {renderedLines.map((line, lineIndex) => {
                const lineDisplayName = resolvePortalItemDisplayName(line.itemId, line.itemName);
                const lineImageUrl = hiddenItemImageIds[line.itemId] ? null : buildTestingItemImageUrl(line.itemId);

                return (
                  <li className="recent-order-line" key={`${entry.compositionSignature}-${line.itemId}-${lineIndex}`}>
                    <span className="recent-order-line-item">
                      <span className="recent-order-line-image-wrap" aria-hidden="true">
                        <span className="recent-order-line-image-fallback">
                          {lineDisplayName.trim().charAt(0) || '•'}
                        </span>
                        {lineImageUrl ? (
                          <img
                            alt=""
                            className="recent-order-line-image"
                            decoding="async"
                            loading="lazy"
                            onError={() => markItemImageUnavailable(line.itemId)}
                            src={lineImageUrl}
                          />
                        ) : null}
                      </span>
                      <span className="recent-order-line-name">{lineDisplayName}</span>
                    </span>
                    <span>
                      <bdi dir="ltr">{line.quantity}</bdi> {line.unit === 'kg' ? 'ק״ג' : 'יח׳'}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="recent-order-card-fallback">פרטי ההרכב עדיין לא זמינים להזמנה.</p>
          )}
          {entry.lines.length > renderedLines.length ? (
            <p className="recent-order-card-more">ועוד {entry.lines.length - renderedLines.length} פריטים בהזמנה</p>
          ) : null}
          <p className="recent-order-card-action">
            {entry.canLoadIntoCart ? 'לחיצה אחת טוענת את הרכב ההזמנה לסל.' : 'הזמנה זו אינה זמינה כרגע לטעינה אוטומטית.'}
          </p>
        </button>
      </li>
    );
  };

  const itemNameById = new Map(
    state.cart.lines.map((line) => [line.itemId, resolvePortalItemDisplayName(line.itemId, line.name)]),
  );
  const customerLabel = humanizeIdentifier(session?.customerId ?? 'unknown-customer', 'cust-');
  const subtotal = state.cart.estimatedTotal;

  return (
    <main className="portal-shell" data-testid={PORTAL_SCREEN_TEST_IDS.orderComposer} dir="rtl" lang="he">
      <header className="portal-top-nav">
        <div className="portal-top-brand" data-testid="portal-heading">עואודה לשיווק בע״מ</div>
      </header>
      <div className="portal-layout">
        <aside className="summary-rail" data-testid="sticky-submit-bar">
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
            <div className="summary-line summary-total">
              <span>סכום כולל</span>
              <span>
                <bdi dir="ltr">{formatCurrency(state.cart.currency, state.cart.estimatedTotal)}</bdi>
              </span>
            </div>
            {state.cart.lines.length > 0 ? (
              <ul className="summary-lines">
                {state.cart.lines.map((line) => (
                  <li className="summary-line" key={line.itemId}>
                    <span>{resolvePortalItemDisplayName(line.itemId, line.name)}</span>
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
            <p className="summary-microcopy">{state.submitBar.summaryLabel}</p>
            <Button
              className="sticky-submit-button"
              data-testid="summary-submit-button"
              disabled={!state.submitBar.submitEnabled || submitState.status === 'mismatch'}
              onClick={() => void handleSubmit()}
              size="lg"
              type="button"
              variant="default"
            >
              {state.submitBar.submitLabel}
            </Button>
          </Card>
        </aside>
        <div className="portal-main-content portal-main-content--expanded" ref={catalogMeasureRef}>
          <section className="portal-welcome">
            <h1>
              <span className="portal-welcome-greeting">ברוכים הבאים, </span>
              <span className="portal-welcome-customer">{customerLabel}</span>
            </h1>
            <p>עואודה לשיווק בע״מ - הזמנה חכמה, מהירה וברורה.</p>
          </section>
          <section className="catalog-section" data-testid={PORTAL_SCREEN_TEST_IDS.recentOrdersPanel}>
            <div className="panel-heading">
              <h2>הזמנות אחרונות</h2>
              <Badge className="panel-chip" variant="outline">{recentOrdersFeed.total} הרכבים</Badge>
            </div>
            {recentOrdersFeed.entries.length === 0 ? (
              <p>היסטוריית ההזמנות תוצג כאן ברגע שתהיה זמינה.</p>
            ) : (
              <>
                <ul className="recent-orders-list">{pagedRecentOrders.map(renderRecentOrderCard)}</ul>
                {recentOrdersTotalPages > 1 ? (
                  <div className="catalog-pagination">
                    <Button
                      disabled={activeRecentOrdersPage <= 1}
                      onClick={() => setRecentOrdersPage((current) => Math.max(1, current - 1))}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      הקודם
                    </Button>
                    <span>עמוד {activeRecentOrdersPage} מתוך {recentOrdersTotalPages}</span>
                    <Button
                      disabled={activeRecentOrdersPage >= recentOrdersTotalPages}
                      onClick={() => setRecentOrdersPage((current) => Math.min(recentOrdersTotalPages, current + 1))}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      הבא
                    </Button>
                  </div>
                ) : null}
                {recentOrdersFeed.total > recentOrdersFeed.entries.length ? (
                  <p className="recent-orders-footnote">
                    מוצגות {recentOrdersFeed.entries.length} מתוך {recentOrdersFeed.total} הזמנות אחרונות.
                  </p>
                ) : null}
              </>
            )}
          </section>
          <section className="catalog-section">
            <div className="panel-heading">
              <h2>{state.sections.approved.title}</h2>
              <Badge className="panel-chip" variant="outline">במיוחד עבורכם</Badge>
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
                    {itemNameById.get(line.itemId) ?? resolvePortalItemDisplayName(line.itemId, '')}: {line.reason}
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
        </div>
      </div>
      {submitState.status === 'success' ? (
        <section
          aria-live="polite"
          className="portal-confirmation-overlay"
          data-kind="success"
          data-testid={PORTAL_SCREEN_TEST_IDS.orderSuccess}
        >
          <Card className="portal-confirmation-card">
            <h2>ההזמנה נקלטה בהצלחה!</h2>
            <p className="portal-confirmation-meta portal-confirmation-meta--reference">
              <span>אסמכתא:</span>
              <bdi className="portal-confirmation-reference-value" dir="ltr">
                {submitState.orderRef}
              </bdi>
              <Button
                aria-label={recentlyCopiedOrderRef === submitState.orderRef ? 'האסמכתא הועתקה' : 'העתקת אסמכתא'}
                className="portal-confirmation-copy-button"
                onClick={() => void copyOrderReference(submitState.orderRef)}
                size="icon"
                title="העתקת אסמכתא"
                type="button"
                variant="ghost"
              >
                <CopyReferenceIcon copied={recentlyCopiedOrderRef === submitState.orderRef} />
              </Button>
            </p>
            <p className="portal-confirmation-meta portal-confirmation-date">{successCapturedAt ?? formatPortalDateTime()}</p>
            {state.cart.lines.length > 0 ? (
              <ul className="portal-confirmation-list">
                {state.cart.lines.map((line) => {
                  const displayName = resolvePortalItemDisplayName(line.itemId, line.name);
                  const imageUrl = hiddenItemImageIds[line.itemId] ? null : buildTestingItemImageUrl(line.itemId);
                  const species = inferItemSpecies(line.itemId);

                  return (
                    <li className="portal-confirmation-item" key={line.itemId}>
                      <div className="portal-confirmation-item-image-wrap">
                        <DeterministicPlaceholder className="item-image-placeholder" label={displayName} seed={line.itemId} />
                        {imageUrl ? (
                          <img
                            alt={displayName}
                            className="item-image-asset"
                            decoding="async"
                            loading="lazy"
                            onError={() => markItemImageUnavailable(line.itemId)}
                            src={imageUrl}
                          />
                        ) : null}
                        {species ? (
                          <span className={`species-badge species-badge--${species}`} aria-hidden="true">
                            <SpeciesIcon species={species} />
                          </span>
                        ) : null}
                      </div>
                      <div className="portal-confirmation-item-info">
                        <h3>{displayName}</h3>
                        <p>כמות: {line.quantity}</p>
                      </div>
                      <div className="portal-confirmation-item-price">
                        {line.lineEstimate === null ? (
                          <span>ממתין</span>
                        ) : (
                          <bdi dir="ltr">{formatCurrency(line.currency, line.lineEstimate)}</bdi>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <div className="portal-confirmation-footer">
              <p className="portal-confirmation-total">
                סה״כ לתשלום: <bdi dir="ltr">{formatCurrency(state.cart.currency, state.cart.estimatedTotal)}</bdi>
              </p>
              <div className="portal-confirmation-actions">
                <Button className="portal-confirmation-repeat-order-button" onClick={resetSubmitDraft} type="button">
                  הזמנה נוספת
                </Button>
              </div>
            </div>
          </Card>
        </section>
      ) : null}
    </main>
  );
}

function normalizeRecentOrdersFeed(feed: unknown): RecentOrdersFeed {
  if (!isObjectRecord(feed)) {
    return EMPTY_RECENT_ORDERS_FEED;
  }

  const rawEntries = Array.isArray(feed.entries) ? feed.entries : [];
  const entries = rawEntries
    .map((entry, index) => normalizeRecentOrderEntry(entry, index))
    .filter((entry): entry is RecentOrderEntry => entry !== null);

  const total = toNonNegativeInteger(feed.total) ?? entries.length;
  const pageSize = toPositiveInteger(feed.pageSize) ?? EMPTY_RECENT_ORDERS_FEED.pageSize;

  return {
    entries,
    total,
    pageSize,
    generatedAt: toNonEmptyString(feed.generatedAt),
    windowStartAt: toNonEmptyString(feed.windowStartAt),
  };
}

function normalizeRecentOrderEntry(entry: unknown, index: number): RecentOrderEntry | null {
  if (!isObjectRecord(entry)) {
    return null;
  }

  const lines = (Array.isArray(entry.lines) ? entry.lines : [])
    .map((line) => normalizeRecentOrderLine(line))
    .filter((line): line is RecentOrderLine => line !== null);

  return {
    compositionSignature: toNonEmptyString(entry.compositionSignature) ?? `recent-order-${index + 1}`,
    lines,
    lastOrderedAt: toNonEmptyString(entry.lastOrderedAt),
    orderCount: toPositiveInteger(entry.orderCount) ?? 1,
    canLoadIntoCart: lines.length > 0,
  };
}

function normalizeRecentOrderLine(line: unknown): RecentOrderLine | null {
  if (!isObjectRecord(line)) {
    return null;
  }

  const itemId = toNonEmptyString(line.itemId);
  if (!itemId) {
    return null;
  }

  return {
    itemId,
    itemName: toNonEmptyString(line.itemName) ?? '',
    quantity: toPositiveInteger(line.quantity) ?? 1,
    unit: line.unit === 'kg' ? 'kg' : 'unit',
  };
}

function formatRecentOrderDate(value: string | null): string {
  if (!value) {
    return 'תאריך הזמנה לא זמין';
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return 'תאריך הזמנה לא זמין';
  }

  const date = new Date(parsed);
  return `${date.toLocaleDateString('he-IL')} · ${date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
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

  const formattedValue = TWO_DECIMAL_NUMBER_FORMATTER.format(amount);

  if (currency === 'ILS') {
    return `₪${formattedValue}`;
  }

  if (!currency) {
    return formattedValue;
  }

  return `${currency} ${formattedValue}`;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toPositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : null;
}

function toNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.floor(value);
  return normalized >= 0 ? normalized : null;
}

function humanizeIdentifier(value: string, prefix: string): string {
  const normalized = value.startsWith(prefix) ? value.slice(prefix.length) : value;
  return normalized
    .split('-')
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function resolvePortalItemDisplayName(itemId: string, itemName: string): string {
  const rawName = itemName.trim();
  if (rawName && !looksLikeRawItemIdentifier(rawName, itemId)) {
    return rawName;
  }

  const normalizedFromId = humanizeIdentifier(itemId, 'itm-').trim();
  if (normalizedFromId && !looksLikeRawItemIdentifier(normalizedFromId, itemId)) {
    return normalizedFromId;
  }

  if (rawName) {
    return rawName;
  }

  return normalizedFromId || itemId;
}

function looksLikeRawItemIdentifier(name: string, itemId: string): boolean {
  const normalizedName = name.trim().toLowerCase();
  const normalizedItemId = itemId.trim().toLowerCase();
  if (!normalizedName) {
    return false;
  }

  if (normalizedName === normalizedItemId) {
    return true;
  }

  return /^\d{1,4}$/.test(normalizedName);
}

function formatPortalDateTime(now: Date = new Date()): string {
  return `${now.toLocaleDateString('he-IL')} · ${now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
}

function buildTestingItemImageUrl(itemId: string): string | null {
  if (isPortalProductionRuntime()) {
    return null;
  }

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

function resolveCatalogGridColumnCount(containerWidth: number): number {
  const fallbackViewportWidth = typeof window !== 'undefined' ? window.innerWidth : TABLET_MIN_VIEWPORT_WIDTH;
  const width = Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : fallbackViewportWidth;
  if (width >= TABLET_MIN_VIEWPORT_WIDTH) {
    return WIDE_CATALOG_GRID_COLUMNS;
  }

  return MOBILE_CATALOG_GRID_COLUMNS;
}

function resolveCatalogGridCellDimension(containerWidth: number, columns: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0 || columns <= 0) {
    return 240;
  }

  const totalGap = PORTAL_CATALOG_GRID_GAP_PX * Math.max(0, columns - 1);
  const cellDimension = Math.floor((containerWidth - totalGap) / columns);
  return Math.max(1, Math.min(TESTING_CUT_MIN_DIMENSION_PX, cellDimension));
}

function resolveCatalogTitleFontSize(cellDimension: number): number {
  if (!Number.isFinite(cellDimension) || cellDimension <= 0) {
    return 16;
  }

  const proportionalSize = Math.round(cellDimension * 0.06);
  if (cellDimension < 130) {
    return Math.max(11, Math.min(14, proportionalSize));
  }

  if (cellDimension < 170) {
    return Math.max(12, Math.min(17, proportionalSize));
  }

  return Math.max(14, Math.min(20, proportionalSize));
}

function resolveCatalogMetaFontSize(cellDimension: number): number {
  if (!Number.isFinite(cellDimension) || cellDimension <= 0) {
    return 13;
  }

  const proportionalSize = Math.round(cellDimension * 0.048);
  if (cellDimension < 130) {
    return Math.max(10, Math.min(12, proportionalSize));
  }

  if (cellDimension < 170) {
    return Math.max(11, Math.min(14, proportionalSize));
  }

  return Math.max(12, Math.min(16, proportionalSize));
}

type CatalogTitleLayout = {
  fontSize: number;
  lineHeight: number;
  maxLines: number;
  minHeight: number;
};

function resolveCatalogTitleLayout(cellDimension: number, itemName: string): CatalogTitleLayout {
  const baseFontSize = resolveCatalogTitleFontSize(cellDimension);
  const normalizedLength = itemName.trim().length;

  let fontSize = baseFontSize;
  let maxLines = 2;

  if (normalizedLength >= 26) {
    fontSize = Math.max(cellDimension < 130 ? 10 : 12, baseFontSize - 2);
    maxLines = 3;
  } else if (normalizedLength >= 20) {
    fontSize = Math.max(cellDimension < 130 ? 10 : 13, baseFontSize - 1);
  }

  const lineHeight = Math.round(fontSize * 1.24);
  return {
    fontSize,
    lineHeight,
    maxLines,
    minHeight: lineHeight * maxLines,
  };
}

function resolvePortalApiBaseUrl(): string {
  const baseUrl = (globalThis as { __CUSTOMER_PORTAL_API_BASE_URL__?: string }).__CUSTOMER_PORTAL_API_BASE_URL__ ?? '/v1';
  return baseUrl.trim().replace(/\/+$/g, '');
}

function isPortalProductionRuntime(): boolean {
  const explicitRuntime = (globalThis as { __CUSTOMER_PORTAL_RUNTIME_ENV__?: string }).__CUSTOMER_PORTAL_RUNTIME_ENV__;
  const normalizedExplicitRuntime = explicitRuntime?.trim().toLowerCase();
  if (normalizedExplicitRuntime === 'production') {
    return true;
  }

  if (normalizedExplicitRuntime === 'testing' || normalizedExplicitRuntime === 'development') {
    return false;
  }

  return false;
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
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
      <path d={SPECIES_ICON_PATH_BY_SPECIES[species]} />
    </svg>
  );
}

function CopyReferenceIcon({ copied }: { copied: boolean }): ReactElement {
  if (copied) {
    return (
      <svg aria-hidden="true" className="portal-confirmation-copy-icon" viewBox="0 0 24 24">
        <path
          d="M20.3 5.7a1 1 0 0 1 0 1.4l-9 9a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4l3.3 3.3 8.3-8.3a1 1 0 0 1 1.4 0Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="portal-confirmation-copy-icon" viewBox="0 0 24 24">
      <path
        d="M15 3a3 3 0 0 1 3 3v1h1a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3v-1H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h8Zm0 2H7a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1v-5a3 3 0 0 1 3-3h5V6a1 1 0 0 0-1-1Zm4 4h-8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1Z"
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
      recentOrders: payload.recentOrders,
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
