import rawLocalizedCuts from "../../api/src/catalog/data/cuts.he.json"

export interface CustomerRecentItem {
	itemId: string
	name: string
	lastOrderedAt: string
	unit?: "kg"
}

export interface CustomerApprovedItem {
	hashItemId: string
	createdAt: string
}

export interface CustomerPricingLine {
	itemId: string
	unitPrice: number
	currency: string
}

export interface OrderCompositionInput {
	recentItems: CustomerRecentItem[]
	approvedItems: CustomerApprovedItem[]
	pricing: CustomerPricingLine[]
	initialQuantities?: Record<string, number>
	viewportWidthPx?: number
}

export type OrderPageState =
	| { status: "loading"; canRetry: false; weakNetworkHint: boolean }
	| { status: "error"; canRetry: true; message: string }
	| {
			status: "ready"
			canRetry: true
			layout: "mobile" | "desktop"
			sections: {
				recent: OrderSection
				approved: OrderSection
			}
			cart: CartSummary
			submitBar: StickySubmitBar
			isSubmitting: boolean
	  }

export interface OrderSection {
	title: string
	items: OrderSectionItem[]
	emptyMessage: string
}

export interface OrderSectionItem {
	itemId: string
	name: string
	quantity: number
	unit: "kg"
	unitPrice: number | null
	currency: string | null
	canIncrement: true
	canDecrement: boolean
}

export interface CartSummaryLine {
	itemId: string
	name: string
	quantity: number
	unit: "kg"
	lineEstimate: number | null
	currency: string | null
}

export interface CartSummary {
	lines: CartSummaryLine[]
	lineCount: number
	totalUnits: number
	estimatedTotal: number
	unknownPriceLineCount: number
	currency: string | null
}

export interface StickySubmitBar {
	visible: boolean
	position: "bottom-sticky"
	mobileOptimized: boolean
	submitEnabled: boolean
	summaryLabel: string
	submitLabel: string
}

type CatalogLine = {
	itemId: string
	name: string
	unit: "kg"
	unitPrice: number | null
	currency: string | null
}

const ITEM_TOKEN_LABEL_HEBREW: Record<string, string> = {
	frozen: "קפוא",
	burger: "המבורגר",
	beef: "בקר",
	chicken: "עוף",
	lamb: "טלה",
	ribeye: "ריבאיי",
	steak: "סטייק",
	brisket: "בריסקט",
	tenderloin: "פילה",
	striploin: "סינטה",
	short: "קצר",
	ribs: "צלעות",
	rib: "צלע",
	osso: "אוסו",
	buco: "בוקה",
	picanha: "פיקניה",
	chops: "צלעות",
	chop: "צלע",
	shoulder: "כתף",
	shank: "שוק",
	breast: "חזה",
	thigh: "ירך",
	drumstick: "שוק",
	wing: "כנף",
	whole: "שלם",
	mince: "טחון",
	ground: "טחון",
	bones: "עצמות",
	schnitzel: "שניצל",
}

type LocalizedCatalogCut = {
	itemId?: unknown
	nameHe?: unknown
	unit?: unknown
}

type LocalizedCatalogGroup = {
	cuts?: unknown
}

type LocalizedCatalogPrimal = {
	groups?: unknown
}

type LocalizedCatalogSpecies = {
	primals?: unknown
}

type LocalizedCatalogRoot = {
	species?: unknown
}

type TestingCatalogMetadata = {
	nameHe: string
	unit: "kg"
}

const TESTING_CATALOG_METADATA_BY_ITEM_ID = buildTestingCatalogMetadataByItemId(rawLocalizedCuts)

function deriveItemDisplayName(itemId: string): string {
	const normalizedItemId = itemId.trim().toLowerCase()
	if (normalizedItemId) {
		const localizedFromCatalog = TESTING_CATALOG_METADATA_BY_ITEM_ID.get(normalizedItemId)?.nameHe
		if (localizedFromCatalog) {
			return localizedFromCatalog
		}
	}

	const normalized = itemId
		.replace(/^itm-/, "")
		.replace(/^item-/, "")
		.replaceAll("-", " ")
		.replaceAll("_", " ")
		.trim()

	if (!normalized) {
		return "מוצר"
	}

	if (/^\d+$/.test(normalized)) {
		return `מוצר ${normalized}`
	}

	const tokens = normalized
		.toLowerCase()
		.split(" ")
		.filter((part) => part.length > 0)
		.filter((part) => !["itm", "item"].includes(part))

	if (tokens.length === 0) {
		return "מוצר"
	}

	const translated = tokens.map((token) => ITEM_TOKEN_LABEL_HEBREW[token] ?? token)
	const hasHebrewTranslation = tokens.some((token) => ITEM_TOKEN_LABEL_HEBREW[token] !== undefined)
	if (hasHebrewTranslation) {
		return translated.join(" ")
	}

	return tokens.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
}

function resolveItemDisplayName(itemId: string, itemName: string): string {
	const rawName = itemName.trim()
	if (rawName && !looksLikeRawItemIdentifier(rawName, itemId)) {
		return rawName
	}

	const localizedFromId = deriveItemDisplayName(itemId).trim()
	if (localizedFromId && !looksLikeRawItemIdentifier(localizedFromId, itemId)) {
		return localizedFromId
	}

	if (rawName) {
		return rawName
	}

	return localizedFromId || itemId
}

function looksLikeRawItemIdentifier(name: string, itemId: string): boolean {
	const normalizedName = name.trim().toLowerCase()
	const normalizedItemId = itemId.trim().toLowerCase()
	if (!normalizedName) {
		return false
	}

	if (normalizedName === normalizedItemId) {
		return true
	}

	return /^\d{1,4}$/.test(normalizedName)
}

export function createOrderLoadingState(): OrderPageState {
	return { status: "loading", canRetry: false, weakNetworkHint: false }
}

export function markOrderLoadingWeakNetwork(state: OrderPageState): OrderPageState {
	if (state.status !== "loading" || state.weakNetworkHint) {
		return state
	}

	return {
		...state,
		weakNetworkHint: true,
	}
}

export function createOrderErrorState(message: string): OrderPageState {
	return {
		status: "error",
		canRetry: true,
		message,
	}
}

export function createOrderReadyState(input: OrderCompositionInput): OrderPageState {
	const baseItems = buildCatalog(input)
	const quantities = sanitizeQuantities(input.initialQuantities ?? {})

	return buildReadyState(baseItems, input, quantities, false)
}

export function setOrderLineQuantity(state: OrderPageState, itemId: string, quantity: number): OrderPageState {
	if (state.status !== "ready") {
		return state
	}

	const nextQuantity = normalizeQuantity(quantity)
	const nextQuantities = getQuantityMap(state)
	nextQuantities[itemId] = nextQuantity

	return rebuildReadyState(state, nextQuantities, state.isSubmitting)
}

export function incrementOrderLineQuantity(state: OrderPageState, itemId: string): OrderPageState {
	if (state.status !== "ready") {
		return state
	}

	const nextQuantities = getQuantityMap(state)
	nextQuantities[itemId] = (nextQuantities[itemId] ?? 0) + 1

	return rebuildReadyState(state, nextQuantities, state.isSubmitting)
}

export function decrementOrderLineQuantity(state: OrderPageState, itemId: string): OrderPageState {
	if (state.status !== "ready") {
		return state
	}

	const nextQuantities = getQuantityMap(state)
	nextQuantities[itemId] = normalizeQuantity((nextQuantities[itemId] ?? 0) - 1)

	return rebuildReadyState(state, nextQuantities, state.isSubmitting)
}

export function markOrderSubmitting(state: OrderPageState): OrderPageState {
	if (state.status !== "ready") {
		return state
	}

	return rebuildReadyState(state, getQuantityMap(state), true)
}

export function clearOrderSubmitting(state: OrderPageState): OrderPageState {
	if (state.status !== "ready") {
		return state
	}

	return rebuildReadyState(state, getQuantityMap(state), false)
}

export function applyAcceptedUnitPrices(
	state: OrderPageState,
	acceptedUnitPriceByItemId: Map<string, number>,
): OrderPageState {
	if (state.status !== "ready" || acceptedUnitPriceByItemId.size === 0) {
		return state
	}

	const overrideItems = (items: OrderSectionItem[]): OrderSectionItem[] =>
		items.map((item) => {
			const acceptedUnitPrice = acceptedUnitPriceByItemId.get(item.itemId)
			return acceptedUnitPrice === undefined ? item : { ...item, unitPrice: acceptedUnitPrice }
		})

	const nextState: Extract<OrderPageState, { status: "ready" }> = {
		...state,
		sections: {
			recent: { ...state.sections.recent, items: overrideItems(state.sections.recent.items) },
			approved: { ...state.sections.approved, items: overrideItems(state.sections.approved.items) },
		},
	}

	// Rebuild so cart line estimates and the estimated total reflect the accepted prices, not the
	// stale pre-mismatch prices the customer never confirmed.
	return rebuildReadyState(nextState, getQuantityMap(nextState), nextState.isSubmitting)
}

function rebuildReadyState(
	state: Extract<OrderPageState, { status: "ready" }>,
	quantities: Record<string, number>,
	isSubmitting: boolean,
): OrderPageState {
	const catalog: CatalogLine[] = []

	for (const item of state.sections.recent.items) {
		catalog.push({
			itemId: item.itemId,
			name: item.name,
			unit: item.unit,
			unitPrice: item.unitPrice,
			currency: item.currency,
		})
	}

	for (const item of state.sections.approved.items) {
		if (catalog.some((line) => line.itemId === item.itemId)) {
			continue
		}

		catalog.push({
			itemId: item.itemId,
			name: item.name,
			unit: item.unit,
			unitPrice: item.unitPrice,
			currency: item.currency,
		})
	}

	const layout = state.layout
	const sectionInputs = {
		recentItems: state.sections.recent.items.map((item) => ({
			itemId: item.itemId,
			name: item.name,
			lastOrderedAt: "",
			unit: item.unit,
		})),
		approvedItems: state.sections.approved.items.map((item) => ({
			hashItemId: item.itemId,
			createdAt: "",
		})),
		pricing: catalog
			.filter(
				(line): line is CatalogLine & { unitPrice: number; currency: string } =>
					line.unitPrice !== null && line.currency !== null,
			)
			.map((line) => ({
				itemId: line.itemId,
				unitPrice: line.unitPrice,
				currency: line.currency,
			})),
		viewportWidthPx: layout === "mobile" ? 390 : 1024,
	} satisfies OrderCompositionInput

	return buildReadyState(catalog, sectionInputs, sanitizeQuantities(quantities), isSubmitting)
}

function buildReadyState(
	catalog: CatalogLine[],
	input: OrderCompositionInput,
	quantities: Record<string, number>,
	isSubmitting: boolean,
): OrderPageState {
	const pricingMap = new Map(input.pricing.map((line) => [line.itemId, line]))
	const lineById = new Map(catalog.map((line) => [line.itemId, line]))

	const recentSection = input.recentItems.map((item) => {
		const price = pricingMap.get(item.itemId)

		return {
			itemId: item.itemId,
			name: resolveItemDisplayName(item.itemId, item.name),
			quantity: quantities[item.itemId] ?? 0,
			unit: lineById.get(item.itemId)?.unit ?? resolveItemUnit(item.itemId, item.unit),
			unitPrice: price?.unitPrice ?? null,
			currency: price?.currency ?? null,
			canIncrement: true,
			canDecrement: (quantities[item.itemId] ?? 0) > 0,
		} satisfies OrderSectionItem
	})

	const approvedSection = input.approvedItems.map((item) => {
		const catalogLine = lineById.get(item.hashItemId)
		const name = resolveItemDisplayName(item.hashItemId, catalogLine?.name ?? "")
		const price = pricingMap.get(item.hashItemId)

		return {
			itemId: item.hashItemId,
			name,
			quantity: quantities[item.hashItemId] ?? 0,
			unit: catalogLine?.unit ?? resolveItemUnit(item.hashItemId),
			unitPrice: price?.unitPrice ?? null,
			currency: price?.currency ?? null,
			canIncrement: true,
			canDecrement: (quantities[item.hashItemId] ?? 0) > 0,
		} satisfies OrderSectionItem
	})

	const cartLines = catalog
		.map((line) => {
			const quantity = quantities[line.itemId] ?? 0
			if (quantity <= 0) {
				return null
			}

			const lineEstimate = line.unitPrice === null ? null : line.unitPrice * quantity

			return {
				itemId: line.itemId,
				name: line.name,
				quantity,
				unit: line.unit,
				lineEstimate,
				currency: line.currency,
			} satisfies CartSummaryLine
		})
		.filter((line): line is CartSummaryLine => line !== null)
		.sort((a, b) => a.name.localeCompare(b.name))

	const estimatedTotal = cartLines.reduce((sum, line) => sum + (line.lineEstimate ?? 0), 0)
	const unknownPriceLineCount = cartLines.filter((line) => line.lineEstimate === null).length
	const totalUnits = cartLines.reduce((sum, line) => sum + line.quantity, 0)
	const layout = (input.viewportWidthPx ?? 390) < 768 ? "mobile" : "desktop"
	const currency = cartLines.find((line) => line.currency !== null)?.currency ?? null

	const cart: CartSummary = {
		lines: cartLines,
		lineCount: cartLines.length,
		totalUnits,
		estimatedTotal,
		unknownPriceLineCount,
		currency,
	}

	return {
		status: "ready",
		canRetry: true,
		layout,
		sections: {
			recent: {
				title: "הזמנות אחרונות",
				items: recentSection,
				emptyMessage: "עדיין אין היסטוריית הזמנות קודמות.",
			},
			approved: {
				title: "קטלוג מוצרים",
				items: approvedSection,
				emptyMessage: "עדיין אין פריטים מאושרים.",
			},
		},
		cart,
		submitBar: buildStickySubmitBar(cart, layout, isSubmitting),
		isSubmitting,
	}
}

function buildCatalog(input: OrderCompositionInput): CatalogLine[] {
	const pricingMap = new Map(input.pricing.map((line) => [line.itemId, line]))
	const catalog = new Map<string, CatalogLine>()

	for (const recent of input.recentItems) {
		const price = pricingMap.get(recent.itemId)

		catalog.set(recent.itemId, {
			itemId: recent.itemId,
			name: resolveItemDisplayName(recent.itemId, recent.name),
			unit: resolveItemUnit(recent.itemId, recent.unit),
			unitPrice: price?.unitPrice ?? null,
			currency: price?.currency ?? null,
		})
	}

	for (const approved of input.approvedItems) {
		const existing = catalog.get(approved.hashItemId)
		const price = pricingMap.get(approved.hashItemId)

		catalog.set(approved.hashItemId, {
			itemId: approved.hashItemId,
			name: resolveItemDisplayName(approved.hashItemId, existing?.name ?? ""),
			unit: existing?.unit ?? resolveItemUnit(approved.hashItemId),
			unitPrice: price?.unitPrice ?? existing?.unitPrice ?? null,
			currency: price?.currency ?? existing?.currency ?? null,
		})
	}

	return [...catalog.values()]
}

function resolveItemUnit(itemId: string, preferredUnit?: "kg"): "kg" {
	void itemId
	void preferredUnit
	return "kg"
}

function buildStickySubmitBar(cart: CartSummary, layout: "mobile" | "desktop", isSubmitting: boolean): StickySubmitBar {
	const hasItems = cart.lineCount > 0
	const currencyPrefix = cart.currency === "ILS" ? "₪" : `${cart.currency ?? ""}`
	const totalLabel = hasItems ? `${currencyPrefix}${cart.estimatedTotal.toFixed(2)}` : `${currencyPrefix}0.00`

	return {
		visible: hasItems,
		position: "bottom-sticky",
		mobileOptimized: layout === "mobile",
		submitEnabled: hasItems && !isSubmitting,
		summaryLabel:
			cart.unknownPriceLineCount > 0 ? "לא ניתן לחשב סכום משוער עבור חלק מהפריטים" : `סה"כ משוער ${totalLabel}`,
		submitLabel: isSubmitting ? "שולחים הזמנה…" : `שליחת הזמנה למפעל (${formatWeightQuantity(cart.totalUnits)} ק״ג)`,
	}
}

function sanitizeQuantities(quantities: Record<string, number>): Record<string, number> {
	return Object.fromEntries(
		Object.entries(quantities).map(([itemId, quantity]) => [itemId, normalizeQuantity(quantity)]),
	)
}

function normalizeQuantity(quantity: number): number {
	if (!Number.isFinite(quantity)) {
		return 0
	}

	const normalized = Math.max(0, Math.round(quantity * 1000) / 1000)
	return Object.is(normalized, -0) ? 0 : normalized
}

function formatWeightQuantity(quantity: number): string {
	return normalizeQuantity(quantity).toFixed(3).replace(/\.?0+$/, "")
}

function getQuantityMap(state: Extract<OrderPageState, { status: "ready" }>): Record<string, number> {
	const quantities: Record<string, number> = {}

	for (const item of state.sections.recent.items) {
		quantities[item.itemId] = item.quantity
	}

	for (const item of state.sections.approved.items) {
		quantities[item.itemId] = item.quantity
	}

	return quantities
}

function buildTestingCatalogMetadataByItemId(rawCatalog: unknown): Map<string, TestingCatalogMetadata> {
	const map = new Map<string, TestingCatalogMetadata>()
	const species = (rawCatalog as LocalizedCatalogRoot)?.species
	if (!Array.isArray(species)) {
		return map
	}

	for (const speciesEntry of species as LocalizedCatalogSpecies[]) {
		const primals = speciesEntry?.primals
		if (!Array.isArray(primals)) {
			continue
		}

		for (const primalEntry of primals as LocalizedCatalogPrimal[]) {
			const groups = primalEntry?.groups
			if (!Array.isArray(groups)) {
				continue
			}

			for (const groupEntry of groups as LocalizedCatalogGroup[]) {
				const cuts = groupEntry?.cuts
				if (!Array.isArray(cuts)) {
					continue
				}

				for (const cutEntry of cuts as LocalizedCatalogCut[]) {
					const itemId = typeof cutEntry?.itemId === "string" ? cutEntry.itemId.trim().toLowerCase() : ""
					const nameHe = typeof cutEntry?.nameHe === "string" ? cutEntry.nameHe.trim() : ""
					if (!itemId || !nameHe) {
						continue
					}

					map.set(itemId, { nameHe, unit: "kg" })
				}
			}
		}
	}

	return map
}
