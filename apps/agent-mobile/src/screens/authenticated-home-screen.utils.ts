import { MaterialCommunityIcons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { Dimensions, Platform } from 'react-native'
import type {
  AgentAssignedCustomer,
  AgentOrderCard,
  SupervisorCustomerOverview,
} from '@awawda/shared-types'

import { IS_PRODUCTION_RUNTIME } from '../config/env'
import { spacing } from '../theme/tokens'
import { resolveTestingCatalogItemName } from './authenticated-home-screen.helpers'
import {
  BASE_VIEWPORT_WIDTH,
  CATALOG_GRID_GAP,
  DEFAULT_CUSTOMER_PHONE,
  MOBILE_CATALOG_GRID_COLUMNS,
  ORDER_DATE_FILTERS,
  TABLET_MIN_VIEWPORT_WIDTH,
  TESTING_CUT_IMAGE_CACHE_BUSTER,
  TESTING_CUT_MIN_DIMENSION_PX,
  TESTING_IMAGE_BASE_URLS,
  type OrderDateFilterId,
  type SupervisorProfileDraft,
  WIDE_CATALOG_GRID_COLUMNS,
} from './authenticated-home-screen.constants'

const FONT_SCALE = Math.max(0.82, Math.min(1, Dimensions.get('window').width / BASE_VIEWPORT_WIDTH))
const TWO_DECIMAL_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export type ItemSpecies = 'beef' | 'chicken' | 'lamb'

export const SPECIES_BADGE_ICON_BY_SPECIES: Record<ItemSpecies, ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  beef: 'cow',
  chicken: 'bird',
  lamb: 'sheep',
}

const ITEM_TOKEN_LABEL_HEBREW: Record<string, string> = {
  arm: 'כתף',
  back: 'גב',
  backs: 'גבים',
  bavette: 'באבט',
  belly: 'בטן',
  blade: 'בלייד',
  boneless: 'ללא עצם',
  breast: 'חזה',
  ribeye: 'ריבאיי',
  steak: 'סטייק',
  steaks: 'סטייקים',
  brisket: 'בריסקט',
  tenderloin: 'פילה',
  tenderloins: 'פילה',
  tender: 'טנדר',
  striploin: 'סינטה',
  strip: 'סטריפ',
  strips: 'סטריפים',
  sirloin: 'סירלוין',
  short: 'קצר',
  ribs: 'צלעות',
  riblets: 'צלעוניות',
  rib: 'צלע',
  top: 'טופ',
  tip: 'קצה',
  tips: 'קצוות',
  osso: 'אוסו',
  buco: 'בוקה',
  picanha: 'פיקניה',
  chops: 'צלעות',
  chop: 'צלע',
  cap: 'כיפה',
  club: 'קלאב',
  denver: 'דנבר',
  eye: 'איי',
  filet: 'פילה',
  flank: 'פלאנק',
  flanken: 'פלאנקן',
  flat: 'פלאט',
  game: 'ציד',
  hanger: 'הנגר',
  inside: 'פנימי',
  iron: 'איירון',
  kansas: 'קנזס',
  knuckle: 'ברך',
  loin: 'מותן',
  marrow: 'מח עצם',
  mignon: 'מיניון',
  mock: 'מוק',
  neck: 'צוואר',
  necks: 'צווארים',
  new: 'ניו',
  onglet: 'אונגלֶה',
  outside: 'חיצוני',
  oxtail: 'זנב שור',
  porterhouse: 'פורטרהאוס',
  prime: 'פריים',
  ranch: 'ראנץ׳',
  rolled: 'מגולגל',
  round: 'עגול',
  rump: 'ראמפ',
  schnitzel: 'שניצל',
  skirt: 'סקירט',
  spinalis: 'ספינליס',
  standing: 'עומד',
  t: 'טי',
  tournedos: 'טורנדו',
  tri: 'טרי',
  tongue: 'לשון',
  white: 'לבן',
  shoulder: 'כתף',
  shank: 'שוק',
  thigh: 'ירך',
  drumstick: 'שוק',
  drumette: 'כנף אמצעית',
  wing: 'כנף',
  wingette: 'כנף אמצעית',
  wings: 'כנפיים',
  whole: 'שלם',
  mince: 'טחון',
  minced: 'טחון',
  ground: 'טחון',
  bones: 'עצמות',
  bone: 'עצם',
  burger: 'המבורגר',
  patty: 'קציצה',
  smoked: 'מעושן',
  entrecote: 'אנטרקוט',
  lamb: 'טלה',
  chicken: 'עוף',
  beef: 'בקר',
}

const ITEM_TOKEN_SKIP = new Set(['itm', 'item', 'in', 'of', 'on', 'the', 'for', 'to', 'and'])

const CITY_NAME_BY_CODE: Record<string, string> = {
  tlv: 'תל אביב',
  rg: 'רמת גן',
  hz: 'הרצליה',
  pt: 'פתח תקווה',
  ashdod: 'אשדוד',
  beersheva: 'באר שבע',
  modiin: 'מודיעין',
  raanana: 'רעננה',
  holon: 'חולון',
  netanya: 'נתניה',
  hadera: 'חדרה',
}

export function getCustomerStatus(customer: AgentAssignedCustomer): { label: string; tone: 'success' | 'warning' } {
  if (customer.approvedItemsCount === 0) {
    return { label: 'דורש פעולה', tone: 'warning' }
  }

  return { label: 'פעיל', tone: 'success' }
}

export function getSupervisorCustomerStatus(customer: SupervisorCustomerOverview): { label: string; tone: 'success' | 'warning' } {
  if (customer.status === 'active') {
    return { label: 'פעיל', tone: 'success' }
  }

  if (customer.status === 'on_hold') {
    return { label: 'מושהה', tone: 'warning' }
  }

  return { label: 'לא פעיל', tone: 'warning' }
}

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export function humanizeCustomerName(customerId: string): string {
  const cleaned = customerId.replace(/^cust-/, '').replaceAll('-', ' ').trim()
  return toTitleCase(cleaned) || customerId
}

export function customerCityLabel(customerId: string): string {
  const cityCode = customerId.replace(/^cust-/, '').split('-')[0]
  return CITY_NAME_BY_CODE[cityCode] ?? 'לקוח אזורי'
}

export function inferItemSpecies(itemId: string): ItemSpecies | null {
  const normalized = itemId.toLowerCase()
  if (normalized.includes('beef')) {
    return 'beef'
  }
  if (normalized.includes('chicken')) {
    return 'chicken'
  }
  if (normalized.includes('lamb')) {
    return 'lamb'
  }
  return null
}

function normalizeItemTokens(itemId: string): string[] {
  return itemId
    .toLowerCase()
    .replace(/^itm[-_]?/, '')
    .replace(/^item[-_]?/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0 && !ITEM_TOKEN_SKIP.has(token))
}

export function humanizeItemName(itemId: string): string {
  const localizedTestingName = resolveTestingCatalogItemName(itemId)
  if (localizedTestingName) {
    return localizedTestingName
  }

  const species = inferItemSpecies(itemId)
  const speciesPrefix = species ? new Set([species]) : new Set<string>()
  const tokens = normalizeItemTokens(itemId).filter((token) => !speciesPrefix.has(token))

  if (tokens.length === 0) {
    const cleaned = itemId.replace(/^itm-/, '').replaceAll('-', ' ').replaceAll('_', ' ').trim()
    return toTitleCase(cleaned) || itemId
  }

  const translated = tokens.map((token) => ITEM_TOKEN_LABEL_HEBREW[token] ?? token)
  const hasHebrewTranslation = tokens.some((token) => ITEM_TOKEN_LABEL_HEBREW[token] !== undefined)
  if (!hasHebrewTranslation) {
    return toTitleCase(tokens.join(' ')) || itemId
  }

  return translated.join(' ')
}

export function resolveOrderItemDisplayName(itemId: string, itemName: string): string {
  const rawName = itemName.trim()
  if (rawName && !looksLikeRawItemIdentifier(rawName, itemId)) {
    return rawName
  }

  const localizedFromId = humanizeItemName(itemId).trim()
  if (localizedFromId && !looksLikeRawItemIdentifier(localizedFromId, itemId)) {
    return localizedFromId
  }

  const normalizedFromName = rawName ? humanizeItemName(rawName).trim() : ''
  if (normalizedFromName && !looksLikeRawItemIdentifier(normalizedFromName, itemId)) {
    return normalizedFromName
  }

  if (rawName) {
    return rawName
  }

  return localizedFromId || itemId
}

export function looksLikeRawItemIdentifier(name: string, itemId: string): boolean {
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

export function buildTestingItemImageUri(itemId: string, baseUrl: string): string | null {
  if (IS_PRODUCTION_RUNTIME) {
    return null
  }

  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/g, '')
  if (!normalizedBaseUrl || !itemId.trim()) {
    return null
  }

  if (/YOUR_LAN_IP/i.test(normalizedBaseUrl)) {
    return null
  }

  const encodedItemId = encodeURIComponent(itemId.trim().toLowerCase())
  return `${normalizedBaseUrl}/v1/testing-assets/items/${encodedItemId}/image?v=${TESTING_CUT_IMAGE_CACHE_BUSTER}`
}

function getNextTestingImageCandidateIndex(currentIndex: number): number | null {
  const nextIndex = currentIndex + 1
  if (nextIndex >= TESTING_IMAGE_BASE_URLS.length) {
    return null
  }

  return nextIndex
}

export function resolveTestingImageCandidateIndex(itemId: string, map: Record<string, number>): number {
  const index = map[itemId]
  if (typeof index === 'number' && Number.isFinite(index)) {
    return index
  }

  return 0
}

export function resolveTestingImageUriFromCandidates(
  itemId: string,
  candidateIndexByItemId: Record<string, number>,
): string | null {
  const candidateIndex = resolveTestingImageCandidateIndex(itemId, candidateIndexByItemId)
  const baseUrl = TESTING_IMAGE_BASE_URLS[candidateIndex]
  if (!baseUrl) {
    return null
  }

  return buildTestingItemImageUri(itemId, baseUrl)
}

export function isTestingImageCandidateExhausted(itemId: string, candidateIndexByItemId: Record<string, number>): boolean {
  const candidateIndex = resolveTestingImageCandidateIndex(itemId, candidateIndexByItemId)
  return candidateIndex >= TESTING_IMAGE_BASE_URLS.length
}

export function moveToNextTestingImageCandidate(
  itemId: string,
  candidateIndexByItemId: Record<string, number>,
): Record<string, number> {
  const currentIndex = resolveTestingImageCandidateIndex(itemId, candidateIndexByItemId)
  const nextIndex = getNextTestingImageCandidateIndex(currentIndex)
  if (nextIndex === null) {
    return {
      ...candidateIndexByItemId,
      [itemId]: TESTING_IMAGE_BASE_URLS.length,
    }
  }

  return {
    ...candidateIndexByItemId,
    [itemId]: nextIndex,
  }
}

export function resolveCatalogGridColumnCount(containerWidth: number): number {
  const width =
    Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : Dimensions.get('window').width

  if (Platform.OS === 'web' || width >= TABLET_MIN_VIEWPORT_WIDTH) {
    return WIDE_CATALOG_GRID_COLUMNS
  }

  return MOBILE_CATALOG_GRID_COLUMNS
}

export function resolveCatalogGridCellDimension(containerWidth: number, columns: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0 || columns <= 0) {
    return 240
  }

  const totalGap = CATALOG_GRID_GAP * Math.max(0, columns - 1)
  const dimension = Math.floor((containerWidth - totalGap - 2) / columns)
  return Math.max(1, Math.min(TESTING_CUT_MIN_DIMENSION_PX, dimension))
}

function resolveCatalogTitleFontSize(cellDimension: number): number {
  if (!Number.isFinite(cellDimension) || cellDimension <= 0) {
    return scaledFont(16)
  }

  const proportionalSize = Math.round(cellDimension * 0.065)
  return Math.max(scaledFont(14), Math.min(scaledFont(20), proportionalSize))
}

export function resolveCatalogMetaFontSize(cellDimension: number): number {
  if (!Number.isFinite(cellDimension) || cellDimension <= 0) {
    return scaledFont(13)
  }

  const proportionalSize = Math.round(cellDimension * 0.048)
  return Math.max(scaledFont(12), Math.min(scaledFont(16), proportionalSize))
}

export type CatalogTitleLayout = {
  fontSize: number
  lineHeight: number
  maxLines: number
  minHeight: number
}

export function resolveCatalogTitleLayout(cellDimension: number, itemName: string): CatalogTitleLayout {
  const baseFontSize = resolveCatalogTitleFontSize(cellDimension)
  const normalizedLength = itemName.trim().length

  let fontSize = baseFontSize
  let maxLines = 2

  if (normalizedLength >= 26) {
    fontSize = Math.max(scaledFont(12), baseFontSize - 2)
    maxLines = 3
  } else if (normalizedLength >= 20) {
    fontSize = Math.max(scaledFont(13), baseFontSize - 1)
  }

  const lineHeight = Math.round(fontSize * 1.24)
  return {
    fontSize,
    lineHeight,
    maxLines,
    minHeight: lineHeight * maxLines,
  }
}

export type OrderDetailLayout = {
  imageSize: number
  imageRequestSize: number
  pricingMinWidth: number
  titleFontSize: number
  titleLineHeight: number
  subtitleFontSize: number
  subtitleLineHeight: number
  titleMaxLines: number
}

export function resolveOrderDetailLayout(containerWidth: number): OrderDetailLayout {
  const width =
    Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : Dimensions.get('window').width
  const isWideViewport = Platform.OS === 'web' || width >= TABLET_MIN_VIEWPORT_WIDTH
  const isCompactViewport = !isWideViewport && width < 390

  const imageSize = isWideViewport ? 104 : isCompactViewport ? 78 : 88
  const pricingMinWidth = isWideViewport ? 120 : isCompactViewport ? 82 : 92

  const estimatedNameColumnWidth = width - spacing.md * 2 - spacing.md * 2 - imageSize - pricingMinWidth
  const compactNameColumn = estimatedNameColumnWidth < 132

  const titleFontSize = compactNameColumn ? scaledFont(12.5) : estimatedNameColumnWidth < 164 ? scaledFont(13) : scaledFont(14)
  const titleLineHeight = Math.round(titleFontSize * 1.25)
  const subtitleFontSize = compactNameColumn ? scaledFont(10) : scaledFont(11)
  const subtitleLineHeight = Math.round(subtitleFontSize * 1.22)

  return {
    imageSize,
    imageRequestSize: Math.max(128, Math.round(imageSize * 2)),
    pricingMinWidth,
    titleFontSize,
    titleLineHeight,
    subtitleFontSize,
    subtitleLineHeight,
    titleMaxLines: compactNameColumn ? 3 : 2,
  }
}

export function formatCurrency(value: number, currency: string): string {
  const normalizedValue = Number.isFinite(value) ? value : 0
  const formattedValue = TWO_DECIMAL_NUMBER_FORMATTER.format(normalizedValue)

  if (currency === 'ILS') {
    return `₪${formattedValue}`
  }

  return `${formattedValue} ${currency}`
}

export function estimateCatalogUnitPrice(itemId: string): number {
  const hashSeed = itemId.split('').reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0)
  return 95 + (hashSeed % 9) * 17
}

export function toDateFilterRange(filterId: OrderDateFilterId): { fromDate?: string; toDate?: string } {
  if (filterId === 'all') {
    return {}
  }

  const filter = ORDER_DATE_FILTERS.find((entry) => entry.id === filterId)
  const days = filter?.days
  if (!days) {
    return {}
  }

  const today = new Date()
  const fromDate = toLocalDayStart(today)
  fromDate.setDate(fromDate.getDate() - days)
  const toDate = toLocalDayEnd(today)

  return {
    fromDate: fromDate.toISOString(),
    toDate: toDate.toISOString(),
  }
}

export function toLocalDayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

export function toLocalDayEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

export function sumOrdersEstimatedTotal(orders: AgentOrderCard[]): number {
  return orders.reduce((total, order) => total + order.estimatedTotal, 0)
}

export function formatRelativeLastOrder(lastOrderAt: string | null): string {
  if (!lastOrderAt) {
    return 'ללא הזמנה קודמת'
  }

  const parsed = Date.parse(lastOrderAt)
  if (Number.isNaN(parsed)) {
    return 'זמן הזמנה לא זמין'
  }

  const minutes = Math.max(1, Math.floor((Date.now() - parsed) / 60000))
  if (minutes < 60) {
    return `לפני ${minutes} דק׳`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `לפני ${hours} שעות`
  }

  const days = Math.floor(hours / 24)
  if (days < 14) {
    return `לפני ${days} ימים`
  }

  const weeks = Math.floor(days / 7)
  if (weeks < 8) {
    return `לפני ${weeks} שבועות`
  }

  const months = Math.floor(days / 30)
  return `לפני ${Math.max(1, months)} חודשים`
}

export function formatOrderDateTime(submittedAt: string): string {
  const parsed = Date.parse(submittedAt)
  if (Number.isNaN(parsed)) {
    return 'מועד הזמנה לא זמין'
  }

  const date = new Date(parsed)
  return `${date.toLocaleDateString('he-IL')} · ${date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
}

export function formatOrderTime(submittedAt: string): string {
  const parsed = Date.parse(submittedAt)
  if (Number.isNaN(parsed)) {
    return 'שעה לא זמינה'
  }

  return new Date(parsed).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

export function formatOrderUnitLabel(unit: 'kg' | 'unit'): string {
  return unit === 'kg' ? 'ק״ג' : 'יח׳'
}

export function toSupervisorProfileDraft(customer: SupervisorCustomerOverview | null): SupervisorProfileDraft {
  if (!customer) {
    return {
      name: '',
      contactName: '',
      phone: '',
      city: '',
      notes: '',
      status: 'active',
    }
  }

  return {
    name: customer.name,
    contactName: customer.contactName ?? '',
    phone: customer.phone ?? '',
    city: customer.city ?? '',
    notes: customer.notes ?? '',
    status: customer.status,
  }
}

export function formatSupervisorAuditEvent(eventType: string): string {
  switch (eventType) {
    case 'supervisor.customer_assignment.added':
    case 'supervisor.customer_assignment.set':
      return 'שיוך לקוח נוסף'
    case 'supervisor.customer_assignment.removed':
    case 'supervisor.customer_assignment.unset':
      return 'שיוך לקוח הוסר'
    case 'supervisor.customer_assignment.bulk_reassign':
      return 'העברה מרוכזת בוצעה'
    case 'supervisor.customer_profile.updated':
      return 'פרופיל לקוח עודכן'
    case 'supervisor.agent_access.updated':
      return 'גישה לסוכן עודכנה'
    default:
      return eventType
  }
}

export function formatSupervisorAuditTime(createdAt: string): string {
  const parsed = Date.parse(createdAt)
  if (Number.isNaN(parsed)) {
    return 'זמן לא זמין'
  }

  return new Date(parsed).toLocaleString('he-IL')
}

export function formatSupervisorOversightRate(value: number): string {
  const normalized = Number.isFinite(value) ? Math.max(0, value) : 0
  const rounded = Math.round(normalized * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`
}

export function formatSupervisorOrderStatus(status: 'submitted' | 'pending_retry' | 'failed'): string {
  if (status === 'pending_retry') {
    return 'ממתין לניסיון חוזר'
  }
  if (status === 'failed') {
    return 'נכשל'
  }
  return 'נשלח'
}

export function scaledFont(baseSize: number): number {
  return Math.max(10, Math.round(baseSize * FONT_SCALE))
}

export function normalizeCustomerPhone(phone: string | null | undefined): string {
  const cleaned = phone?.trim()
  if (!cleaned) {
    return DEFAULT_CUSTOMER_PHONE
  }
  return cleaned
}
