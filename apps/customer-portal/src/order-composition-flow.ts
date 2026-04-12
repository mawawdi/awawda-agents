export interface CustomerRecentItem {
  itemId: string;
  name: string;
  lastOrderedAt: string;
}

export interface CustomerApprovedItem {
  hashItemId: string;
  createdAt: string;
}

export interface CustomerPricingLine {
  itemId: string;
  unitPrice: number;
  currency: string;
}

export interface OrderCompositionInput {
  recentItems: CustomerRecentItem[];
  approvedItems: CustomerApprovedItem[];
  pricing: CustomerPricingLine[];
  initialQuantities?: Record<string, number>;
  viewportWidthPx?: number;
}

export type OrderPageState =
  | { status: 'loading'; canRetry: false; weakNetworkHint: boolean }
  | { status: 'error'; canRetry: true; message: string }
  | {
      status: 'ready';
      canRetry: true;
      layout: 'mobile' | 'desktop';
      sections: {
        recent: OrderSection;
        approved: OrderSection;
      };
      cart: CartSummary;
      submitBar: StickySubmitBar;
      isSubmitting: boolean;
    };

export interface OrderSection {
  title: string;
  items: OrderSectionItem[];
  emptyMessage: string;
}

export interface OrderSectionItem {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number | null;
  currency: string | null;
  canIncrement: true;
  canDecrement: boolean;
}

export interface CartSummaryLine {
  itemId: string;
  name: string;
  quantity: number;
  lineEstimate: number | null;
  currency: string | null;
}

export interface CartSummary {
  lines: CartSummaryLine[];
  lineCount: number;
  totalUnits: number;
  estimatedTotal: number;
  unknownPriceLineCount: number;
  currency: string | null;
}

export interface StickySubmitBar {
  visible: boolean;
  position: 'bottom-sticky';
  mobileOptimized: boolean;
  submitEnabled: boolean;
  summaryLabel: string;
  submitLabel: string;
}

type CatalogLine = {
  itemId: string;
  name: string;
  unitPrice: number | null;
  currency: string | null;
};

function deriveItemDisplayName(itemId: string): string {
  const normalized = itemId.replace(/^itm-/, '').replace(/^item-/, '').replaceAll('-', ' ').trim();

  if (!normalized) {
    return 'מוצר';
  }

  if (/^\d+$/.test(normalized)) {
    return `מוצר ${normalized}`;
  }

  return normalized
    .split(' ')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function createOrderLoadingState(): OrderPageState {
  return { status: 'loading', canRetry: false, weakNetworkHint: false };
}

export function markOrderLoadingWeakNetwork(state: OrderPageState): OrderPageState {
  if (state.status !== 'loading' || state.weakNetworkHint) {
    return state;
  }

  return {
    ...state,
    weakNetworkHint: true,
  };
}

export function createOrderErrorState(message: string): OrderPageState {
  return {
    status: 'error',
    canRetry: true,
    message,
  };
}

export function createOrderReadyState(input: OrderCompositionInput): OrderPageState {
  const baseItems = buildCatalog(input);
  const quantities = sanitizeQuantities(input.initialQuantities ?? {});

  return buildReadyState(baseItems, input, quantities, false);
}

export function setOrderLineQuantity(
  state: OrderPageState,
  itemId: string,
  quantity: number,
): OrderPageState {
  if (state.status !== 'ready') {
    return state;
  }

  const nextQuantity = Math.max(0, Math.floor(quantity));
  const nextQuantities = getQuantityMap(state);
  nextQuantities[itemId] = nextQuantity;

  return rebuildReadyState(state, nextQuantities, state.isSubmitting);
}

export function incrementOrderLineQuantity(state: OrderPageState, itemId: string): OrderPageState {
  if (state.status !== 'ready') {
    return state;
  }

  const nextQuantities = getQuantityMap(state);
  nextQuantities[itemId] = (nextQuantities[itemId] ?? 0) + 1;

  return rebuildReadyState(state, nextQuantities, state.isSubmitting);
}

export function decrementOrderLineQuantity(state: OrderPageState, itemId: string): OrderPageState {
  if (state.status !== 'ready') {
    return state;
  }

  const nextQuantities = getQuantityMap(state);
  nextQuantities[itemId] = Math.max(0, (nextQuantities[itemId] ?? 0) - 1);

  return rebuildReadyState(state, nextQuantities, state.isSubmitting);
}

export function markOrderSubmitting(state: OrderPageState): OrderPageState {
  if (state.status !== 'ready') {
    return state;
  }

  return rebuildReadyState(state, getQuantityMap(state), true);
}

export function clearOrderSubmitting(state: OrderPageState): OrderPageState {
  if (state.status !== 'ready') {
    return state;
  }

  return rebuildReadyState(state, getQuantityMap(state), false);
}

function rebuildReadyState(
  state: Extract<OrderPageState, { status: 'ready' }>,
  quantities: Record<string, number>,
  isSubmitting: boolean,
): OrderPageState {
  const catalog: CatalogLine[] = [];

  for (const item of state.sections.recent.items) {
    catalog.push({
      itemId: item.itemId,
      name: item.name,
      unitPrice: item.unitPrice,
      currency: item.currency,
    });
  }

  for (const item of state.sections.approved.items) {
    if (catalog.some((line) => line.itemId === item.itemId)) {
      continue;
    }

    catalog.push({
      itemId: item.itemId,
      name: item.name,
      unitPrice: item.unitPrice,
      currency: item.currency,
    });
  }

  const layout = state.layout;
  const sectionInputs = {
    recentItems: state.sections.recent.items.map((item) => ({
      itemId: item.itemId,
      name: item.name,
      lastOrderedAt: '',
    })),
    approvedItems: state.sections.approved.items.map((item) => ({
      hashItemId: item.itemId,
      createdAt: '',
    })),
    pricing: catalog
      .filter((line): line is CatalogLine & { unitPrice: number; currency: string } =>
        line.unitPrice !== null && line.currency !== null,
      )
      .map((line) => ({
        itemId: line.itemId,
        unitPrice: line.unitPrice,
        currency: line.currency,
      })),
    viewportWidthPx: layout === 'mobile' ? 390 : 1024,
  } satisfies OrderCompositionInput;

  return buildReadyState(catalog, sectionInputs, sanitizeQuantities(quantities), isSubmitting);
}

function buildReadyState(
  catalog: CatalogLine[],
  input: OrderCompositionInput,
  quantities: Record<string, number>,
  isSubmitting: boolean,
): OrderPageState {
  const pricingMap = new Map(input.pricing.map((line) => [line.itemId, line]));
  const lineById = new Map(catalog.map((line) => [line.itemId, line]));

  const recentSection = input.recentItems.map((item) => {
    const price = pricingMap.get(item.itemId);

    return {
      itemId: item.itemId,
      name: item.name,
      quantity: quantities[item.itemId] ?? 0,
      unitPrice: price?.unitPrice ?? null,
      currency: price?.currency ?? null,
      canIncrement: true,
      canDecrement: (quantities[item.itemId] ?? 0) > 0,
    } satisfies OrderSectionItem;
  });

  const approvedSection = input.approvedItems.map((item) => {
    const catalogLine = lineById.get(item.hashItemId);
    const name = catalogLine?.name ?? deriveItemDisplayName(item.hashItemId);
    const price = pricingMap.get(item.hashItemId);

    return {
      itemId: item.hashItemId,
      name,
      quantity: quantities[item.hashItemId] ?? 0,
      unitPrice: price?.unitPrice ?? null,
      currency: price?.currency ?? null,
      canIncrement: true,
      canDecrement: (quantities[item.hashItemId] ?? 0) > 0,
    } satisfies OrderSectionItem;
  });

  const cartLines = catalog
    .map((line) => {
      const quantity = quantities[line.itemId] ?? 0;
      if (quantity <= 0) {
        return null;
      }

      const lineEstimate = line.unitPrice === null ? null : line.unitPrice * quantity;

      return {
        itemId: line.itemId,
        name: line.name,
        quantity,
        lineEstimate,
        currency: line.currency,
      } satisfies CartSummaryLine;
    })
    .filter((line): line is CartSummaryLine => line !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const estimatedTotal = cartLines.reduce((sum, line) => sum + (line.lineEstimate ?? 0), 0);
  const unknownPriceLineCount = cartLines.filter((line) => line.lineEstimate === null).length;
  const totalUnits = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const layout = (input.viewportWidthPx ?? 390) < 768 ? 'mobile' : 'desktop';
  const currency = cartLines.find((line) => line.currency !== null)?.currency ?? null;

  const cart: CartSummary = {
    lines: cartLines,
    lineCount: cartLines.length,
    totalUnits,
    estimatedTotal,
    unknownPriceLineCount,
    currency,
  };

  return {
    status: 'ready',
    canRetry: true,
    layout,
    sections: {
      recent: {
        title: 'הנתחים הקבועים שלכם',
        items: recentSection,
        emptyMessage: 'עדיין אין פריטים מהזמנות קודמות.',
      },
      approved: {
        title: 'קטלוג מאושר',
        items: approvedSection,
        emptyMessage: 'עדיין אין פריטים מאושרים.',
      },
    },
    cart,
    submitBar: buildStickySubmitBar(cart, layout, isSubmitting),
    isSubmitting,
  };
}

function buildCatalog(input: OrderCompositionInput): CatalogLine[] {
  const pricingMap = new Map(input.pricing.map((line) => [line.itemId, line]));
  const catalog = new Map<string, CatalogLine>();

  for (const recent of input.recentItems) {
    const price = pricingMap.get(recent.itemId);

    catalog.set(recent.itemId, {
      itemId: recent.itemId,
      name: recent.name,
      unitPrice: price?.unitPrice ?? null,
      currency: price?.currency ?? null,
    });
  }

  for (const approved of input.approvedItems) {
    const existing = catalog.get(approved.hashItemId);
    const price = pricingMap.get(approved.hashItemId);

    catalog.set(approved.hashItemId, {
      itemId: approved.hashItemId,
      name: existing?.name ?? deriveItemDisplayName(approved.hashItemId),
      unitPrice: price?.unitPrice ?? existing?.unitPrice ?? null,
      currency: price?.currency ?? existing?.currency ?? null,
    });
  }

  return [...catalog.values()];
}

function buildStickySubmitBar(
  cart: CartSummary,
  layout: 'mobile' | 'desktop',
  isSubmitting: boolean,
): StickySubmitBar {
  const hasItems = cart.lineCount > 0;
  const currencyPrefix = cart.currency === 'ILS' ? '₪' : `${cart.currency ?? ''}`;
  const totalLabel = hasItems
    ? `${currencyPrefix}${cart.estimatedTotal.toFixed(2)}`
    : `${currencyPrefix}0.00`;

  return {
    visible: hasItems,
    position: 'bottom-sticky',
    mobileOptimized: layout === 'mobile',
    submitEnabled: hasItems && !isSubmitting,
    summaryLabel:
      cart.unknownPriceLineCount > 0
        ? 'לא ניתן לחשב סכום משוער עבור חלק מהפריטים'
        : `סה"כ משוער ${totalLabel}`,
    submitLabel: isSubmitting ? 'שולחים הזמנה…' : `שליחת הזמנה למפעל (${cart.totalUnits} יחידות)`,
  };
}

function sanitizeQuantities(quantities: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(quantities).map(([itemId, quantity]) => [itemId, Math.max(0, Math.floor(quantity))]),
  );
}

function getQuantityMap(state: Extract<OrderPageState, { status: 'ready' }>): Record<string, number> {
  const quantities: Record<string, number> = {};

  for (const item of state.sections.recent.items) {
    quantities[item.itemId] = item.quantity;
  }

  for (const item of state.sections.approved.items) {
    quantities[item.itemId] = item.quantity;
  }

  return quantities;
}
