import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons'
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  ImageBackground,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type {
  AgentApprovedItem,
  AgentAssignedCustomer,
  AgentMagicLinkIssueResponse,
  AgentOrderCard,
} from '@awawda/shared-types'

import { buildCandidateBaseUrls } from '../api/api-base-url-fallback'
import {
  cancelAgentOrder,
  generateMagicLink,
  listAgentOrders,
  listApprovedItems,
  listAssignedCustomers,
} from '../api/agent-customers-client'
import { API_BASE_URL } from '../config/env'
import { useAuth } from '../auth/auth-provider'
import { palette, radius, spacing, touchTarget } from '../theme/tokens'
import {
  type AgentDashboardTabId,
  buildMagicLinkShareMessage,
  buildWhatsAppDeepLink,
  formatMagicLinkExpiry,
  getResilienceHint,
  normalizeMagicLinkForShare,
  shouldUseCopyLinkFallback,
} from './agent-dashboard-presenter'
import {
  placeholderColor,
  placeholderImageUri,
  resolveTestingCatalogItemName,
} from './authenticated-home-screen.helpers'
import { AGENT_SCREEN_TEST_IDS } from './agent-screen-ids'

const SLOW_NETWORK_THRESHOLD_MS = 1800

const TAB_ITEMS: Array<{ id: AgentDashboardTabId; label: string; icon: React.ComponentProps<typeof MaterialIcons>['name'] }> = [
  { id: 'home', label: 'בית', icon: 'home' },
  { id: 'customers', label: 'לקוחות', icon: 'group' },
  { id: 'orders', label: 'הזמנות', icon: 'receipt' },
  { id: 'settings', label: 'הגדרות', icon: 'settings' },
]

type CustomerFilterId = 'all' | 'active' | 'needs_action' | 'pending_link'

const CUSTOMER_FILTERS: Array<{ id: CustomerFilterId; label: string }> = [
  { id: 'all', label: 'הכל' },
  { id: 'active', label: 'פעיל' },
  { id: 'needs_action', label: 'דורש פעולה' },
  { id: 'pending_link', label: 'ממתין ללינק' },
]

type OrderDateFilterId = 'all' | '7d' | '30d' | '90d'

const ORDER_DATE_FILTERS: Array<{ id: OrderDateFilterId; label: string; days?: number }> = [
  { id: 'all', label: 'כל התקופה' },
  { id: '7d', label: '7 ימים', days: 7 },
  { id: '30d', label: '30 ימים', days: 30 },
  { id: '90d', label: '90 ימים', days: 90 },
]

const ORDERS_PAGE_SIZE = 6
const TESTING_CUT_MIN_DIMENSION_PX = 512
const CATALOG_GRID_GAP = spacing.sm
const CATALOG_GRID_ROWS_PER_PAGE = 3
const MOBILE_CATALOG_GRID_COLUMNS = 3
const WIDE_CATALOG_GRID_COLUMNS = 4
const TABLET_MIN_VIEWPORT_WIDTH = 768
const TESTING_CUT_IMAGE_CACHE_BUSTER = 'testing-cuts-v4'
const TESTING_IMAGE_BASE_URLS = buildCandidateBaseUrls(API_BASE_URL)
const IS_RTL_LAYOUT = true
const DEFAULT_CUSTOMER_PHONE = '054-000-0000'
const BASE_VIEWPORT_WIDTH = 430
const FONT_SCALE = Math.max(0.82, Math.min(1, Dimensions.get('window').width / BASE_VIEWPORT_WIDTH))
const NUMERIC_FONT_FAMILY =
  Platform.select({
    web: '"Plus Jakarta Sans", system-ui, sans-serif',
    default: 'PlusJakartaSans_800ExtraBold',
  }) ?? 'PlusJakartaSans_800ExtraBold'
const HEBREW_CHAR_PATTERN = /[\u0590-\u05FF]/
const DIGIT_PATTERN = /\d/
const NUMERIC_TOKEN_PATTERN = /([₪$€£]?-?\d[\d,]*(?:\.\d+)?%?)/g
const TWO_DECIMAL_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

type ItemSpecies = 'beef' | 'chicken' | 'lamb'

const SPECIES_BADGE_ICON_BY_SPECIES: Record<ItemSpecies, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
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

function getCustomerStatus(customer: AgentAssignedCustomer): { label: string; tone: 'success' | 'warning' } {
  if (customer.approvedItemsCount === 0) {
    return { label: 'דורש פעולה', tone: 'warning' }
  }

  return { label: 'פעיל', tone: 'success' }
}

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

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function humanizeCustomerName(customerId: string): string {
  const cleaned = customerId.replace(/^cust-/, '').replaceAll('-', ' ').trim()
  return toTitleCase(cleaned) || customerId
}

function customerCityLabel(customerId: string): string {
  const cityCode = customerId.replace(/^cust-/, '').split('-')[0]
  return CITY_NAME_BY_CODE[cityCode] ?? 'לקוח אזורי'
}

function inferItemSpecies(itemId: string): ItemSpecies | null {
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

function humanizeItemName(itemId: string): string {
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

function resolveOrderItemDisplayName(itemId: string, itemName: string): string {
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

function renderSpeciesBadge(itemId: string, size: 'default' | 'small' = 'default'): React.JSX.Element | null {
  const species = inferItemSpecies(itemId)
  if (!species) {
    return null
  }

  const speciesStyle =
    species === 'beef' ? styles.speciesBadgeBeef : species === 'chicken' ? styles.speciesBadgeChicken : styles.speciesBadgeLamb
  const iconName = SPECIES_BADGE_ICON_BY_SPECIES[species]
  const iconSize = size === 'small' ? 12 : 14

  return (
    <View style={[styles.speciesBadge, size === 'small' && styles.speciesBadgeSmall, speciesStyle]}>
      <MaterialCommunityIcons color="#fff" name={iconName} size={iconSize} />
    </View>
  )
}

function buildTestingItemImageUri(itemId: string, baseUrl: string): string | null {
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

function resolveTestingImageCandidateIndex(itemId: string, map: Record<string, number>): number {
  const index = map[itemId]
  if (typeof index === 'number' && Number.isFinite(index)) {
    return index
  }

  return 0
}

function resolveTestingImageUriFromCandidates(
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

function isTestingImageCandidateExhausted(itemId: string, candidateIndexByItemId: Record<string, number>): boolean {
  const candidateIndex = resolveTestingImageCandidateIndex(itemId, candidateIndexByItemId)
  return candidateIndex >= TESTING_IMAGE_BASE_URLS.length
}

function moveToNextTestingImageCandidate(
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

function resolveCatalogGridColumnCount(containerWidth: number): number {
  const width =
    Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : Dimensions.get('window').width

  if (Platform.OS === 'web' || width >= TABLET_MIN_VIEWPORT_WIDTH) {
    return WIDE_CATALOG_GRID_COLUMNS
  }

  return MOBILE_CATALOG_GRID_COLUMNS
}

function resolveCatalogGridCellDimension(containerWidth: number, columns: number): number {
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

function resolveCatalogMetaFontSize(cellDimension: number): number {
  if (!Number.isFinite(cellDimension) || cellDimension <= 0) {
    return scaledFont(13)
  }

  const proportionalSize = Math.round(cellDimension * 0.048)
  return Math.max(scaledFont(12), Math.min(scaledFont(16), proportionalSize))
}

type CatalogTitleLayout = {
  fontSize: number
  lineHeight: number
  maxLines: number
  minHeight: number
}

function resolveCatalogTitleLayout(cellDimension: number, itemName: string): CatalogTitleLayout {
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

type OrderDetailLayout = {
  imageSize: number
  imageRequestSize: number
  pricingMinWidth: number
  titleFontSize: number
  titleLineHeight: number
  subtitleFontSize: number
  subtitleLineHeight: number
  titleMaxLines: number
}

function resolveOrderDetailLayout(containerWidth: number): OrderDetailLayout {
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

function formatCurrency(value: number, currency: string): string {
  const normalizedValue = Number.isFinite(value) ? value : 0
  const formattedValue = TWO_DECIMAL_NUMBER_FORMATTER.format(normalizedValue)

  if (currency === 'ILS') {
    return `₪${formattedValue}`
  }

  return `${formattedValue} ${currency}`
}

function renderHebrewNumericRuns(value: string): React.ReactNode {
  if (!HEBREW_CHAR_PATTERN.test(value) || !DIGIT_PATTERN.test(value)) {
    return value
  }

  const segments = value.split(NUMERIC_TOKEN_PATTERN).filter((segment) => segment.length > 0)
  return segments.map((segment, index) =>
    DIGIT_PATTERN.test(segment) ? (
      <Text key={`numeric-${index}`} style={styles.inlineNumericRun}>
        {segment}
      </Text>
    ) : (
      segment
    ),
  )
}

function estimateCatalogUnitPrice(itemId: string): number {
  const hashSeed = itemId.split('').reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0)
  return 95 + (hashSeed % 9) * 17
}

function toDateFilterRange(filterId: OrderDateFilterId): { fromDate?: string; toDate?: string } {
  if (filterId === 'all') {
    return {}
  }

  const filter = ORDER_DATE_FILTERS.find((entry) => entry.id === filterId)
  const days = filter?.days
  if (!days) {
    return {}
  }

  const toDate = new Date()
  const fromDate = new Date(toDate)
  fromDate.setDate(toDate.getDate() - days)

  return {
    fromDate: fromDate.toISOString().slice(0, 10),
    toDate: toDate.toISOString().slice(0, 10),
  }
}

function toApiDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function sumOrdersEstimatedTotal(orders: AgentOrderCard[]): number {
  return orders.reduce((total, order) => total + order.estimatedTotal, 0)
}

function formatRelativeLastOrder(lastOrderAt: string | null): string {
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

function formatOrderDateTime(submittedAt: string): string {
  const parsed = Date.parse(submittedAt)
  if (Number.isNaN(parsed)) {
    return 'מועד הזמנה לא זמין'
  }

  const date = new Date(parsed)
  return `${date.toLocaleDateString('he-IL')} · ${date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
}

function formatOrderTime(submittedAt: string): string {
  const parsed = Date.parse(submittedAt)
  if (Number.isNaN(parsed)) {
    return 'שעה לא זמינה'
  }

  return new Date(parsed).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

function formatOrderUnitLabel(unit: 'kg' | 'unit'): string {
  return unit === 'kg' ? 'ק״ג' : 'יח׳'
}

function scaledFont(baseSize: number): number {
  return Math.max(10, Math.round(baseSize * FONT_SCALE))
}

export function AuthenticatedHomeScreen(): React.JSX.Element {
  const { signOut, profile, token } = useAuth()
  const insets = useSafeAreaInsets()
  const [activeTab, setActiveTab] = useState<AgentDashboardTabId>('home')
  const [customerSearchQuery, setCustomerSearchQuery] = useState('')
  const [ordersSearchQuery, setOrdersSearchQuery] = useState('')
  const [activeCustomerFilter, setActiveCustomerFilter] = useState<CustomerFilterId>('all')

  const [customers, setCustomers] = useState<AgentAssignedCustomer[]>([])
  const [isCustomersLoading, setIsCustomersLoading] = useState(true)
  const [customersError, setCustomersError] = useState<string | null>(null)
  const [isCustomersSlow, setIsCustomersSlow] = useState(false)

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [isCustomerDetailOpen, setIsCustomerDetailOpen] = useState(false)
  const [approvedItems, setApprovedItems] = useState<AgentApprovedItem[]>([])
  const [isApprovedItemsLoading, setIsApprovedItemsLoading] = useState(false)
  const [approvedItemsError, setApprovedItemsError] = useState<string | null>(null)
  const [isApprovedItemsSlow, setIsApprovedItemsSlow] = useState(false)
  const [itemImageCandidateIndexByItemId, setItemImageCandidateIndexByItemId] = useState<Record<string, number>>({})
  const [catalogPage, setCatalogPage] = useState(1)
  const [catalogGridWidth, setCatalogGridWidth] = useState(0)
  const [orderDetailListWidth, setOrderDetailListWidth] = useState(0)

  const [isGeneratingLink, setIsGeneratingLink] = useState(false)
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null)
  const [magicLinkInfo, setMagicLinkInfo] = useState<string | null>(null)
  const [latestMagicLink, setLatestMagicLink] = useState<AgentMagicLinkIssueResponse | null>(null)
  const [latestMagicLinkCustomerId, setLatestMagicLinkCustomerId] = useState<string | null>(null)
  const [pendingCopyLink, setPendingCopyLink] = useState<string | null>(null)

  const [orders, setOrders] = useState<AgentOrderCard[]>([])
  const [isOrdersLoading, setIsOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [isOrdersSlow, setIsOrdersSlow] = useState(false)
  const [activeOrderDateFilter, setActiveOrderDateFilter] = useState<OrderDateFilterId>('30d')
  const [ordersPage, setOrdersPage] = useState(1)
  const [ordersTotal, setOrdersTotal] = useState(0)
  const [ordersTotalPages, setOrdersTotalPages] = useState(1)
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [homeOrdersToday, setHomeOrdersToday] = useState<AgentOrderCard[]>([])
  const [isHomeOrdersLoading, setIsHomeOrdersLoading] = useState(false)
  const [homeOrdersError, setHomeOrdersError] = useState<string | null>(null)
  const [monthlySalesTotal, setMonthlySalesTotal] = useState(0)
  const [monthlyGoalAmount, setMonthlyGoalAmount] = useState(120_000)
  const [monthlyGoalDraft, setMonthlyGoalDraft] = useState('120000')
  const [monthlyGoalError, setMonthlyGoalError] = useState<string | null>(null)

  const rootOpacity = useRef(new Animated.Value(1)).current
  const headerTranslateY = useRef(new Animated.Value(0)).current
  const contentOpacity = useRef(new Animated.Value(1)).current
  const contentTranslateY = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(rootOpacity, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(headerTranslateY, {
        toValue: 0,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 420,
        delay: 60,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(contentTranslateY, {
        toValue: 0,
        duration: 420,
        delay: 60,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start()
  }, [contentOpacity, contentTranslateY, headerTranslateY, rootOpacity])

  useEffect(() => {
    contentOpacity.setValue(0.4)
    contentTranslateY.setValue(8)
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(contentTranslateY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start()
  }, [activeTab, contentOpacity, contentTranslateY])

  const beginSlowNetworkTimer = useCallback((setSlowState: (value: boolean) => void): (() => void) => {
    setSlowState(false)
    const timeoutId = setTimeout(() => {
      setSlowState(true)
    }, SLOW_NETWORK_THRESHOLD_MS)

    return () => {
      clearTimeout(timeoutId)
      setSlowState(false)
    }
  }, [])

  const loadCustomers = useCallback(async () => {
    if (!token) {
      setCustomers([])
      setSelectedCustomerId(null)
      setIsCustomersLoading(false)
      setCustomersError('הסשן חסר. התחברו מחדש כדי להמשיך.')
      return
    }

    setIsCustomersLoading(true)
    setCustomersError(null)
    const clearSlowState = beginSlowNetworkTimer(setIsCustomersSlow)

    try {
      const response = await listAssignedCustomers(token)
      setCustomers(response.customers)
      setSelectedCustomerId((current) => {
        if (current && response.customers.some((customer) => customer.customerId === current)) {
          return current
        }

        return response.customers[0]?.customerId ?? null
      })
      if (response.customers.length === 0) {
        setIsCustomerDetailOpen(false)
      }
    } catch (error) {
      setCustomersError(error instanceof Error ? error.message : 'לא הצלחנו לטעון את רשימת הלקוחות.')
      setCustomers([])
      setSelectedCustomerId(null)
      setIsCustomerDetailOpen(false)
    } finally {
      clearSlowState()
      setIsCustomersLoading(false)
    }
  }, [beginSlowNetworkTimer, token])

  const loadApprovedItemsForCustomer = useCallback(
    async (customerId: string) => {
      if (!token) {
        setApprovedItems([])
        setApprovedItemsError('הסשן חסר. התחברו מחדש כדי להמשיך.')
        return
      }

      setIsApprovedItemsLoading(true)
      setApprovedItemsError(null)
      const clearSlowState = beginSlowNetworkTimer(setIsApprovedItemsSlow)

      try {
        const response = await listApprovedItems(token, customerId)
        setApprovedItems(response.items)
        setItemImageCandidateIndexByItemId({})
      } catch (error) {
        setApprovedItems([])
        setApprovedItemsError(error instanceof Error ? error.message : 'לא הצלחנו לטעון פריטים מאושרים.')
      } finally {
        clearSlowState()
        setIsApprovedItemsLoading(false)
      }
    },
    [beginSlowNetworkTimer, token],
  )

  useEffect(() => {
    void loadCustomers()
  }, [loadCustomers])

  useEffect(() => {
    if (!selectedCustomerId) {
      setApprovedItems([])
      setApprovedItemsError(null)
      return
    }

    void loadApprovedItemsForCustomer(selectedCustomerId)
  }, [loadApprovedItemsForCustomer, selectedCustomerId])

  useEffect(() => {
    setItemImageCandidateIndexByItemId({})
  }, [selectedCustomerId, token])

  useEffect(() => {
    setCatalogPage(1)
  }, [selectedCustomerId])

  useEffect(() => {
    const nextColumns = resolveCatalogGridColumnCount(catalogGridWidth)
    const nextPageSize = Math.max(nextColumns * CATALOG_GRID_ROWS_PER_PAGE, 1)
    const nextTotalPages = Math.max(1, Math.ceil(approvedItems.length / nextPageSize))
    setCatalogPage((current) => Math.min(current, nextTotalPages))
  }, [approvedItems.length, catalogGridWidth])

  const loadOrders = useCallback(async () => {
    if (!token) {
      setOrders([])
      setOrdersError('הסשן חסר. התחברו מחדש כדי להמשיך.')
      setOrdersTotal(0)
      setOrdersTotalPages(1)
      return
    }

    setIsOrdersLoading(true)
    setOrdersError(null)
    const clearSlowState = beginSlowNetworkTimer(setIsOrdersSlow)

    try {
      const dateRange = toDateFilterRange(activeOrderDateFilter)
      const response = await listAgentOrders(token, {
        page: ordersPage,
        pageSize: ORDERS_PAGE_SIZE,
        fromDate: dateRange.fromDate,
        toDate: dateRange.toDate,
        query: ordersSearchQuery.trim() || undefined,
      })
      setOrders(response.orders)
      setOrdersTotal(response.total)
      setOrdersTotalPages(response.totalPages)
      if (response.totalPages > 0 && ordersPage > response.totalPages) {
        setOrdersPage(response.totalPages)
      }
    } catch (error) {
      setOrders([])
      setOrdersTotal(0)
      setOrdersTotalPages(1)
      setOrdersError(error instanceof Error ? error.message : 'לא הצלחנו לטעון את ההזמנות הקודמות.')
    } finally {
      clearSlowState()
      setIsOrdersLoading(false)
    }
  }, [activeOrderDateFilter, beginSlowNetworkTimer, ordersPage, ordersSearchQuery, token])

  const loadOrdersInRange = useCallback(
    async (fromDate: string, toDate: string): Promise<AgentOrderCard[]> => {
      if (!token) {
        return []
      }

      const aggregatedOrders: AgentOrderCard[] = []
      let page = 1
      let totalPages = 1

      while (page <= totalPages) {
        const response = await listAgentOrders(token, {
          page,
          pageSize: 50,
          fromDate,
          toDate,
        })
        aggregatedOrders.push(...response.orders)
        totalPages = response.totalPages
        page += 1
      }

      return aggregatedOrders
    },
    [token],
  )

  const loadHomeOrdersSnapshot = useCallback(async () => {
    if (!token) {
      setHomeOrdersToday([])
      setMonthlySalesTotal(0)
      setHomeOrdersError('הסשן חסר. התחברו מחדש כדי להמשיך.')
      return
    }

    const today = new Date()
    const todayDate = toApiDateInput(today)
    const monthStartDate = toApiDateInput(new Date(today.getFullYear(), today.getMonth(), 1))

    setIsHomeOrdersLoading(true)
    setHomeOrdersError(null)

    try {
      const [todayOrders, monthOrders] = await Promise.all([
        loadOrdersInRange(todayDate, todayDate),
        loadOrdersInRange(monthStartDate, todayDate),
      ])

      setHomeOrdersToday(
        todayOrders.sort((left, right) => Date.parse(right.submittedAt) - Date.parse(left.submittedAt)),
      )
      setMonthlySalesTotal(sumOrdersEstimatedTotal(monthOrders))
    } catch (error) {
      setHomeOrdersToday([])
      setMonthlySalesTotal(0)
      setHomeOrdersError(error instanceof Error ? error.message : 'לא הצלחנו לטעון את נתוני המכירות.')
    } finally {
      setIsHomeOrdersLoading(false)
    }
  }, [loadOrdersInRange, token])

  const applyMonthlyGoal = useCallback(() => {
    const normalized = Number(monthlyGoalDraft.replace(/[^\d]/g, ''))
    if (!Number.isFinite(normalized) || normalized <= 0) {
      setMonthlyGoalError('יש להזין יעד חודשי מספרי גדול מאפס.')
      return
    }

    setMonthlyGoalAmount(normalized)
    setMonthlyGoalDraft(String(normalized))
    setMonthlyGoalError(null)
  }, [monthlyGoalDraft])

  useEffect(() => {
    setOrdersPage(1)
  }, [activeOrderDateFilter, ordersSearchQuery])

  useEffect(() => {
    if (activeTab === 'orders') {
      void loadOrders()
      return
    }

    if (activeTab === 'home') {
      void loadHomeOrdersSnapshot()
      return
    }

    if (activeTab === 'customers') {
      void loadCustomers()
    }
  }, [activeTab, loadCustomers, loadHomeOrdersSnapshot, loadOrders])

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.customerId === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  )
  const selectedOrder = useMemo(
    () => orders.find((order) => order.orderId === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  )
  useEffect(() => {
    if (selectedOrderId && !orders.some((order) => order.orderId === selectedOrderId)) {
      setSelectedOrderId(null)
    }
  }, [orders, selectedOrderId])
  const markItemImageUnavailable = useCallback((itemId: string) => {
    setItemImageCandidateIndexByItemId((current) => {
      if (isTestingImageCandidateExhausted(itemId, current)) {
        return current
      }
      return moveToNextTestingImageCandidate(itemId, current)
    })
  }, [])

  const resolveItemImageUri = useCallback(
    (itemId: string, width: number, height: number): string => {
      return resolveTestingImageUriFromCandidates(itemId, itemImageCandidateIndexByItemId) ?? placeholderImageUri(itemId, width, height)
    },
    [itemImageCandidateIndexByItemId],
  )

  const normalizedSearchQuery = customerSearchQuery.trim().toLowerCase()
  const matchesCustomerFilter = useCallback(
    (customer: AgentAssignedCustomer): boolean => {
      if (activeCustomerFilter === 'all') {
        return true
      }

      if (activeCustomerFilter === 'active') {
        return customer.approvedItemsCount > 0
      }

      if (activeCustomerFilter === 'needs_action') {
        return customer.approvedItemsCount === 0
      }

      return latestMagicLinkCustomerId !== customer.customerId
    },
    [activeCustomerFilter, latestMagicLinkCustomerId],
  )

  const filteredCustomers = useMemo(() => {
    const scopedCustomers = normalizedSearchQuery
      ? customers.filter((customer) => {
          const searchable = `${customer.customerId} ${humanizeCustomerName(customer.customerId)}`.toLowerCase()
          return searchable.includes(normalizedSearchQuery)
        })
      : customers

    return scopedCustomers.filter(matchesCustomerFilter)
  }, [customers, matchesCustomerFilter, normalizedSearchQuery])

  const todaySalesTotal = useMemo(() => sumOrdersEstimatedTotal(homeOrdersToday), [homeOrdersToday])

  const dashboardKpis = useMemo(() => {
    const monthlyProgress = monthlyGoalAmount <= 0 ? 0 : Math.round((monthlySalesTotal / monthlyGoalAmount) * 100)
    const clampedProgress = Math.max(0, Math.min(999, monthlyProgress))
    const activeCustomers = customers.filter((customer) => customer.approvedItemsCount > 0).length

    return [
      {
        id: 'sales',
        label: 'מכירות היום',
        value: formatCurrency(todaySalesTotal, 'ILS'),
        meta: `${homeOrdersToday.length} הזמנות`,
        icon: 'payments' as const,
      },
      {
        id: 'target',
        label: 'יעד חודשי',
        value: `${clampedProgress}%`,
        meta: `${formatCurrency(monthlySalesTotal, 'ILS')} / ${formatCurrency(monthlyGoalAmount, 'ILS')}`,
        icon: 'flag' as const,
      },
      {
        id: 'orders_today',
        label: 'הזמנות היום',
        value: `${homeOrdersToday.length}`,
        meta: 'בוצעו על ידי לקוחות',
        icon: 'receipt-long' as const,
      },
      { id: 'active', label: 'לקוחות פעילים', value: `${activeCustomers}`, meta: 'במערכת', icon: 'group' as const },
    ]
  }, [customers, homeOrdersToday.length, monthlyGoalAmount, monthlySalesTotal, todaySalesTotal])

  const openCustomerDetail = useCallback((customerId: string) => {
    setSelectedCustomerId(customerId)
    setIsCustomerDetailOpen(true)
    setActiveTab('customers')
  }, [])

  const openCustomerOrders = useCallback((customerId: string) => {
    setSelectedCustomerId(customerId)
    setIsCustomerDetailOpen(false)
    setSelectedOrderId(null)
    setOrdersSearchQuery(customerId)
    setOrdersPage(1)
    setActiveTab('orders')
  }, [])

  const cancelOrder = useCallback(
    async (orderId: string) => {
      if (!token) {
        setOrdersError('הסשן פג. התחברו מחדש.')
        return
      }

      setCancelingOrderId(orderId)
      setOrdersError(null)
      try {
        await cancelAgentOrder(token, orderId, 'בוטל על ידי סוכן')
        setOrders((current) => current.filter((order) => order.orderId !== orderId))
        setOrdersTotal((current) => Math.max(0, current - 1))
      } catch (error) {
        setOrdersError(error instanceof Error ? error.message : 'לא הצלחנו לבטל את ההזמנה.')
      } finally {
        setCancelingOrderId(null)
      }
    },
    [token],
  )

  const copyFallbackLink = useCallback(async () => {
    if (!pendingCopyLink) {
      return
    }

    await Clipboard.setStringAsync(pendingCopyLink)
    setMagicLinkInfo('הקישור הועתק. ניתן לשלוח ידנית אם וואטסאפ לא זמין.')
    setMagicLinkError(null)
    setPendingCopyLink(null)
  }, [pendingCopyLink])

  const openCustomerCall = useCallback(async (phoneNumber: string) => {
    const sanitizedPhone = phoneNumber.replace(/[^\d+]/g, '')
    if (!sanitizedPhone) {
      return
    }

    try {
      await Linking.openURL(`tel:${sanitizedPhone}`)
    } catch (error) {
      setMagicLinkError(error instanceof Error ? error.message : 'לא הצלחנו לפתוח את אפליקציית החיוג.')
    }
  }, [])

  const openCustomerAddressInWaze = useCallback(async (address: string) => {
    const trimmedAddress = address.trim()
    if (!trimmedAddress) {
      return
    }

    const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(trimmedAddress)}&navigate=yes`
    try {
      await Linking.openURL(wazeUrl)
    } catch (error) {
      setMagicLinkError(error instanceof Error ? error.message : 'לא הצלחנו לפתוח ניווט ב-Waze.')
    }
  }, [])

  const generateAndShareLink = useCallback(
    async (customerIdOverride?: string) => {
      const targetCustomerId = customerIdOverride ?? selectedCustomerId

      if (!token) {
        setMagicLinkError('הסשן פג. התחברו מחדש.')
        return
      }

      if (!targetCustomerId) {
        setMagicLinkError('בחרו לקוח לפני יצירת קישור.')
        return
      }

      setSelectedCustomerId(targetCustomerId)
      setIsGeneratingLink(true)
      setMagicLinkError(null)
      setMagicLinkInfo(null)
      setPendingCopyLink(null)

      let generatedLink: AgentMagicLinkIssueResponse | null = null

      try {
        const payload = await generateMagicLink(token, targetCustomerId)
        const normalizedPayload = normalizeMagicLinkForShare(payload)
        const expiresAtIn24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        const presentationPayload: AgentMagicLinkIssueResponse = {
          ...normalizedPayload,
          expiresAt: expiresAtIn24Hours,
          expiresInSeconds: 24 * 60 * 60,
        }
        generatedLink = presentationPayload
        setLatestMagicLink(presentationPayload)
        setLatestMagicLinkCustomerId(targetCustomerId)
        const message = buildMagicLinkShareMessage(targetCustomerId, presentationPayload)
        const deepLink = buildWhatsAppDeepLink(message)
        const canOpenWhatsApp = await Linking.canOpenURL(deepLink)

        if (shouldUseCopyLinkFallback(canOpenWhatsApp)) {
          setPendingCopyLink(presentationPayload.linkUrl)
          setMagicLinkError('וואטסאפ לא זמין במכשיר הזה. העתיקו את הקישור במקום.')
          return
        }

        await Linking.openURL(deepLink)
        setMagicLinkInfo('הקישור נוצר ונשלח בהצלחה.')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'לא הצלחנו ליצור קישור ללקוח.'
        setMagicLinkError(message)
        setPendingCopyLink(shouldUseCopyLinkFallback(true, error) ? generatedLink?.linkUrl ?? null : null)
      } finally {
        setIsGeneratingLink(false)
      }
    },
    [selectedCustomerId, token],
  )

  const renderBanner = (message: string | null, isError = false): React.JSX.Element | null => {
    if (!message) {
      return null
    }

    return <Text style={isError ? styles.errorBanner : styles.noticeBanner}>{message}</Text>
  }

  const renderMagicLinkActions = (customerId: string | null): React.JSX.Element => {
    return (
      <View style={styles.panelSection}>
        <Text style={styles.panelTitle}>פעולות</Text>
        <View style={styles.customerActionRow}>
          <Pressable
            accessibilityRole="button"
            disabled={isGeneratingLink || !customerId}
            onPress={() => {
              void generateAndShareLink(customerId ?? undefined)
            }}
            style={({ pressed }) => [styles.primaryButtonSmall, (pressed || isGeneratingLink || !customerId) && styles.primaryButtonDisabled]}
          >
            {isGeneratingLink ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>שליחת קישור</Text>}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!customerId}
            onPress={() => {
              if (!customerId) {
                return
              }
              openCustomerOrders(customerId)
            }}
            style={({ pressed }) => [styles.secondaryButtonSmall, (pressed || !customerId) && styles.primaryButtonDisabled]}
          >
            <Text style={styles.secondaryButtonText}>הזמנות לקוח</Text>
          </Pressable>
        </View>
        {magicLinkError ? <Text style={styles.errorText}>{magicLinkError}</Text> : null}
        {magicLinkInfo ? <Text style={styles.noticeText}>{magicLinkInfo}</Text> : null}
        {pendingCopyLink ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void copyFallbackLink()
            }}
            style={({ pressed }) => [styles.linkButtonInline, pressed && styles.linkButtonDisabled]}
          >
            <Text style={styles.linkButtonText}>העתקת קישור חלופי</Text>
          </Pressable>
        ) : null}
        {latestMagicLink && latestMagicLinkCustomerId === customerId ? (
          <View style={styles.linkMetaCard}>
            <Text style={styles.linkMetaTitle}>קישור הזמנה מוכן</Text>
            <Text style={styles.linkMetaValue}>
              {renderHebrewNumericRuns(`פג תוקף: ${formatMagicLinkExpiry(latestMagicLink.expiresAt)}`)}
            </Text>
            <Text style={styles.linkMetaHint}>{renderHebrewNumericRuns('תוקף הקישור נקבע ל־24 שעות.')}</Text>
          </View>
        ) : null}
      </View>
    )
  }

  const renderCustomersList = (isCompact = false): React.JSX.Element => {
    if (isCustomersLoading && customers.length === 0) {
      return (
        <View style={styles.loadingState}>
          <ActivityIndicator />
          <Text style={styles.mutedText}>טוענים את רשימת הלקוחות…</Text>
        </View>
      )
    }

    if (filteredCustomers.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.mutedText}>
            {customers.length === 0 ? 'אין עדיין לקוחות משויכים.' : 'לא נמצאו לקוחות שמתאימים לחיפוש.'}
          </Text>
        </View>
      )
    }

    return (
      <View style={styles.customerListSection}>
        {!isCompact ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.customerFilterScroller}
            contentContainerStyle={styles.customerFilterContent}
          >
            {CUSTOMER_FILTERS.map((filter) => {
              const isSelected = filter.id === activeCustomerFilter
              return (
                <Pressable
                  accessibilityRole="button"
                  key={filter.id}
                  onPress={() => {
                    setActiveCustomerFilter(filter.id)
                  }}
                  style={({ pressed }) => [
                    styles.filterChip,
                    isSelected ? styles.filterChipSelected : styles.filterChipDefault,
                    pressed && styles.tabButtonPressed,
                  ]}
                >
                  <Text style={[styles.filterChipText, isSelected ? styles.filterChipTextSelected : styles.filterChipTextDefault]}>
                    {renderHebrewNumericRuns(filter.label)}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        ) : null}

        <View style={styles.customerGrid}>
          {filteredCustomers.map((customer) => {
            const status = getCustomerStatus(customer)

            return (
              <Pressable
                accessibilityRole="button"
                key={customer.customerId}
                onPress={() => {
                  openCustomerDetail(customer.customerId)
                }}
                style={({ pressed }) => [
                  styles.customerCard,
                  isCompact && styles.customerCardCompact,
                  status.tone === 'success' ? styles.customerCardPrimaryBorder : styles.customerCardSecondaryBorder,
                  pressed && styles.customerCardPressed,
                ]}
                testID="customer-list-card"
              >
                <View style={styles.customerCardHeader}>
                  <View style={styles.statusRow}>
                    <View style={[styles.statusDot, status.tone === 'success' ? styles.statusDotSuccess : styles.statusDotWarning]} />
                    <Text style={styles.statusText}>{status.label}</Text>
                  </View>
                  <Text style={styles.customerCode}>לקוח פעיל</Text>
                </View>
                <Text style={styles.customerId}>{humanizeCustomerName(customer.customerId)}</Text>
                <Text style={styles.customerMeta}>
                  {renderHebrewNumericRuns(`הזמנה אחרונה: ${formatRelativeLastOrder(customer.lastOrderAt)}`)}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>
    )
  }

  const renderOrderPreviewCard = (
    order: AgentOrderCard,
    options: { timeOnly: boolean; onPress?: () => void } = { timeOnly: false },
  ): React.JSX.Element => {
    const submittedLabel = options.timeOnly ? `שעה ${formatOrderTime(order.submittedAt)}` : formatOrderDateTime(order.submittedAt)
    const statusLabel =
      order.status === 'submitted' ? 'נשלח' : order.status === 'pending_retry' ? 'ממתין לאישור' : 'נכשל'

    return (
      <Pressable
        accessibilityRole="button"
        key={order.orderId}
        onPress={() => {
          options.onPress?.()
        }}
        style={({ pressed }) => [styles.orderCard, pressed && styles.customerCardPressed]}
      >
        <View style={styles.orderHeader}>
          <Text numberOfLines={1} style={styles.orderTitle}>
            {order.customerName}
          </Text>
          <Text numberOfLines={1} style={styles.orderTotal}>
            {renderHebrewNumericRuns(`סיכום ביניים: ${formatCurrency(order.estimatedTotal, order.currency)}`)}
          </Text>
        </View>

        <View style={styles.orderSummaryMetaRow}>
          <Text style={styles.orderMetaStrong}>{renderHebrewNumericRuns(submittedLabel)}</Text>
          <Text style={styles.orderMeta}>{statusLabel}</Text>
        </View>

        <View style={styles.orderPreviewItems}>
          {order.items.slice(0, 3).map((line, index) => {
            const unitPrice = line.quantity > 0 ? line.lineTotal / line.quantity : line.lineTotal
            const localizedName = resolveOrderItemDisplayName(line.itemId, line.itemName)
            return (
              <View
                key={`${order.orderId}-${line.itemId}-${index}`}
                style={styles.orderPreviewItemCard}
              >
                <View style={styles.orderPreviewItemImageWrap}>
                  <ImageBackground
                    accessibilityIgnoresInvertColors
                    onError={() => {
                      markItemImageUnavailable(line.itemId)
                    }}
                    source={{ uri: resolveItemImageUri(line.itemId, 84, 84) }}
                    style={[styles.orderPreviewItemImage, { backgroundColor: placeholderColor(line.itemId) }]}
                    imageStyle={styles.orderPreviewItemImageAsset}
                  />
                  <View style={styles.orderThumbBadge}>
                    <Text style={styles.orderThumbBadgeText}>{line.quantity}</Text>
                  </View>
                  {renderSpeciesBadge(line.itemId, 'small')}
                </View>
                <View style={styles.orderPreviewItemContent}>
                  <Text numberOfLines={2} style={styles.orderPreviewItemName}>
                    {localizedName}
                  </Text>
                  <Text style={styles.orderPreviewItemQuantity}>{renderHebrewNumericRuns(`כמות: ${line.quantity}`)}</Text>
                  <View style={styles.orderPreviewMetricsRow}>
                    <View style={styles.orderPreviewMetric}>
                      <Text style={styles.orderPreviewMetricLabel}>סך הכל:</Text>
                      <Text style={styles.orderPreviewMetricValue}>{formatCurrency(line.lineTotal, order.currency)}</Text>
                    </View>
                    <View style={styles.orderPreviewMetric}>
                      <Text style={styles.orderPreviewMetricLabel}>מחיר יחידה:</Text>
                      <Text style={styles.orderPreviewMetricValue}>{formatCurrency(unitPrice, order.currency)}</Text>
                    </View>
                  </View>
                </View>
              </View>
            )
          })}
        </View>
      </Pressable>
    )
  }

  const renderDashboardTab = (): React.JSX.Element => (
    <View style={styles.tabSection} testID={AGENT_SCREEN_TEST_IDS.dashboard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>ביצועים היום</Text>
      </View>
      <View style={styles.dashboardHeroCard}>
        <Text style={styles.dashboardHeroLabel}>{dashboardKpis[0]?.label ?? 'מכירות היום'}</Text>
        <Text style={styles.dashboardHeroValue}>{dashboardKpis[0]?.value ?? '₪0.00'}</Text>
        <View style={styles.dashboardHeroMetaRow}>
          <Text style={styles.dashboardHeroMeta}>{renderHebrewNumericRuns(dashboardKpis[0]?.meta ?? '0 הזמנות')}</Text>
          <MaterialIcons color="#fecaca" name="payments" size={24} />
        </View>
      </View>
      <View style={styles.kpiGrid}>
        {dashboardKpis.slice(1).map((kpi) => (
          <View key={kpi.id} style={styles.kpiCard}>
            <View style={styles.kpiHeader}>
              <Text style={styles.kpiLabel}>{kpi.label}</Text>
              <MaterialIcons color={palette.secondary} name={kpi.icon} size={18} />
            </View>
            <Text style={styles.kpiValue}>{kpi.value}</Text>
            <Text style={styles.kpiMeta}>{renderHebrewNumericRuns(kpi.meta)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.panelSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>הזמנות היום</Text>
          <Text style={styles.sectionMeta}>{renderHebrewNumericRuns(`${homeOrdersToday.length} הזמנות`)}</Text>
        </View>
        {renderBanner(getResilienceHint(false, homeOrdersError), Boolean(homeOrdersError))}
        {isHomeOrdersLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator />
            <Text style={styles.mutedText}>טוענים הזמנות להיום…</Text>
          </View>
        ) : homeOrdersToday.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.mutedText}>אין הזמנות שבוצעו היום.</Text>
          </View>
        ) : (
          <View style={styles.homeOrdersList}>
            {homeOrdersToday.map((order) => (
              <View key={order.orderId}>
                {renderOrderPreviewCard(order, {
                  timeOnly: true,
                  onPress: () => {
                    setSelectedOrderId(order.orderId)
                    setActiveTab('orders')
                  },
                })}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  )

  const renderCustomerDetail = (): React.JSX.Element => {
    if (!selectedCustomer) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.mutedText}>בחרו לקוח כדי לראות את מסך הפרטים המלא.</Text>
        </View>
      )
    }

    const status = getCustomerStatus(selectedCustomer)
    const customerAddress = customerCityLabel(selectedCustomer.customerId)

    return (
      <View style={styles.tabSection} testID={AGENT_SCREEN_TEST_IDS.customerDetail}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setIsCustomerDetailOpen(false)
          }}
          style={({ pressed }) => [styles.detailBackButton, pressed && styles.primaryButtonDisabled]}
        >
          <MaterialIcons color={palette.secondary} name="arrow-forward" size={16} />
          <Text style={styles.detailBackButtonText}>חזרה לרשימת הלקוחות</Text>
        </Pressable>

        <View style={styles.customerNameCard}>
          <Text style={styles.customerNameCardTitle}>{humanizeCustomerName(selectedCustomer.customerId)}</Text>
          <Text style={styles.customerNameCardSubtitle}>{status.label}</Text>
        </View>

        <View style={styles.detailInfoGrid}>
          <View style={styles.detailInfoCard}>
            <Text style={styles.customerDetailLabel}>טלפון ליצירת קשר</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void openCustomerCall(DEFAULT_CUSTOMER_PHONE)
              }}
              style={({ pressed }) => [styles.detailInfoAction, pressed && styles.linkButtonDisabled]}
            >
              <Text style={styles.customerDetailValueLink}>{DEFAULT_CUSTOMER_PHONE}</Text>
            </Pressable>
          </View>
          <View style={styles.detailInfoCard}>
            <Text style={styles.customerDetailLabel}>כתובת העסק</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void openCustomerAddressInWaze(customerAddress)
              }}
              style={({ pressed }) => [styles.detailInfoAction, pressed && styles.linkButtonDisabled]}
            >
              <Text style={styles.customerDetailValueLink}>{customerAddress}</Text>
            </Pressable>
          </View>
        </View>

        {renderMagicLinkActions(selectedCustomer.customerId)}

        <View style={styles.panelSection}>
          <Text style={styles.panelTitle}>פריטים מאושרים של הלקוח</Text>
          {renderBanner(getResilienceHint(isApprovedItemsSlow, approvedItemsError), Boolean(approvedItemsError))}
          {isApprovedItemsLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator />
              <Text style={styles.mutedText}>טוענים פריטים מאושרים…</Text>
            </View>
          ) : approvedItems.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.mutedText}>אין עדיין פריטים מאושרים עבור הלקוח הזה.</Text>
            </View>
          ) : (
            <>
              {(() => {
                const approvedGalleryItems = approvedItems.slice(0, 24).map((item) => ({
                  ...item,
                  unitPrice: estimateCatalogUnitPrice(item.hashItemId),
                }))
                const approvedColumnCount = resolveCatalogGridColumnCount(catalogGridWidth)
                const approvedCellDimension = resolveCatalogGridCellDimension(catalogGridWidth, approvedColumnCount)
                const approvedImageDimension = Math.max(96, Math.floor(approvedCellDimension * (approvedColumnCount >= 4 ? 0.72 : 0.8)))
                const approvedMetaFontSize = resolveCatalogMetaFontSize(approvedCellDimension)
                const approvedMetaLineHeight = Math.round(approvedMetaFontSize * 1.25)
                const approvedPageSize = Math.max(approvedColumnCount * CATALOG_GRID_ROWS_PER_PAGE, 1)
                const approvedTotalPages = Math.max(1, Math.ceil(approvedGalleryItems.length / approvedPageSize))
                const approvedActivePage = Math.min(catalogPage, approvedTotalPages)
                const approvedPageStart = (approvedActivePage - 1) * approvedPageSize
                const approvedPageItems = approvedGalleryItems.slice(approvedPageStart, approvedPageStart + approvedPageSize)

                return (
                  <>
                    <View
                      onLayout={(event) => {
                        const width = Math.floor(event.nativeEvent.layout.width)
                        setCatalogGridWidth((current) => (current === width ? current : width))
                      }}
                      style={styles.catalogCardList}
                    >
                      {approvedPageItems.map((item) => {
                        const itemDisplayName = humanizeItemName(item.hashItemId)
                        const titleLayout = resolveCatalogTitleLayout(approvedCellDimension, itemDisplayName)

                        return (
                          <View key={`${item.hashItemId}-${item.createdAt}`} style={[styles.catalogItemCard, { width: approvedCellDimension }]}>
                            <ImageBackground
                              accessibilityIgnoresInvertColors
                              onError={() => {
                                markItemImageUnavailable(item.hashItemId)
                              }}
                              resizeMode="cover"
                              source={{ uri: resolveItemImageUri(item.hashItemId, 640, 640) }}
                              style={[
                                styles.catalogItemImagePlaceholder,
                                { backgroundColor: placeholderColor(item.hashItemId), height: approvedImageDimension },
                              ]}
                              imageStyle={styles.catalogItemImageAsset}
                            >
                              {renderSpeciesBadge(item.hashItemId)}
                            </ImageBackground>
                            <View style={[styles.catalogItemHeader, { minHeight: titleLayout.minHeight }]}>
                              <Text
                                adjustsFontSizeToFit
                                minimumFontScale={0.84}
                                numberOfLines={titleLayout.maxLines}
                                style={[
                                  styles.catalogItemTitleEnhanced,
                                  {
                                    fontSize: titleLayout.fontSize,
                                    lineHeight: titleLayout.lineHeight,
                                  },
                                ]}
                              >
                                {itemDisplayName}
                              </Text>
                            </View>
                            <Text
                              numberOfLines={1}
                              style={[styles.catalogItemMetaEnhanced, { fontSize: approvedMetaFontSize, lineHeight: approvedMetaLineHeight }]}
                            >
                              {renderHebrewNumericRuns(`${formatCurrency(item.unitPrice, 'ILS')} / יח׳`)}
                            </Text>
                          </View>
                        )
                      })}
                    </View>
                    {approvedTotalPages > 1 ? (
                      <View style={styles.catalogPaginationRow}>
                        <Pressable
                          accessibilityRole="button"
                          disabled={approvedActivePage <= 1}
                          onPress={() => {
                            setCatalogPage((current) => Math.max(1, current - 1))
                          }}
                          style={({ pressed }) =>
                            [styles.outlineButtonSmall, (approvedActivePage <= 1 || pressed) && styles.primaryButtonDisabled]
                          }
                        >
                          <Text style={styles.outlineButtonText}>הקודם</Text>
                        </Pressable>
                        <Text style={styles.catalogPaginationLabel}>
                          {renderHebrewNumericRuns(`עמוד ${approvedActivePage} מתוך ${approvedTotalPages}`)}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          disabled={approvedActivePage >= approvedTotalPages}
                          onPress={() => {
                            setCatalogPage((current) => Math.min(approvedTotalPages, current + 1))
                          }}
                          style={({ pressed }) =>
                            [styles.outlineButtonSmall, (approvedActivePage >= approvedTotalPages || pressed) && styles.primaryButtonDisabled]
                          }
                        >
                          <Text style={styles.outlineButtonText}>הבא</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </>
                )
              })()}
            </>
          )}
        </View>
      </View>
    )
  }

  const renderCustomersTab = (): React.JSX.Element => (
    <View
      style={styles.tabSection}
      testID={isCustomerDetailOpen ? AGENT_SCREEN_TEST_IDS.customerDetail : AGENT_SCREEN_TEST_IDS.customersList}
    >
      {!isCustomerDetailOpen ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>לקוחות</Text>
          <Text style={styles.sectionMeta}>{renderHebrewNumericRuns(`${filteredCustomers.length} לקוחות בתצוגה`)}</Text>
        </View>
      ) : null}
      {renderBanner(getResilienceHint(isCustomersSlow, customersError), Boolean(customersError))}
      {isCustomerDetailOpen ? renderCustomerDetail() : renderCustomersList()}
    </View>
  )

  const renderOrdersTab = (): React.JSX.Element => {
    const orderDetailLayout = resolveOrderDetailLayout(orderDetailListWidth)

    if (selectedOrder) {
      return (
        <View style={styles.tabSection} testID={AGENT_SCREEN_TEST_IDS.orderDetail}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSelectedOrderId(null)
            }}
            style={({ pressed }) => [styles.detailBackButton, pressed && styles.primaryButtonDisabled]}
          >
            <MaterialIcons color={palette.secondary} name="arrow-forward" size={16} />
            <Text style={styles.detailBackButtonText}>חזרה לרשימת ההזמנות</Text>
          </Pressable>

          <View style={styles.orderDetailHeroCard}>
            <Text style={styles.orderDetailRestaurant}>{selectedOrder.customerName}</Text>
            <Text style={styles.orderDetailDate}>{formatOrderDateTime(selectedOrder.submittedAt)}</Text>
            <Text style={styles.orderDetailTotal}>{formatCurrency(selectedOrder.estimatedTotal, selectedOrder.currency)}</Text>
            <View style={styles.orderDetailStatusPill}>
              <Text style={styles.orderDetailStatusText}>
                {selectedOrder.status === 'submitted' ? 'סטטוס: נשלח' : selectedOrder.status === 'pending_retry' ? 'סטטוס: ממתין לאישור' : 'סטטוס: נכשל'}
              </Text>
            </View>
          </View>

          <View style={styles.panelSection}>
            <Text style={styles.panelTitle}>פרטי ההזמנה</Text>
            <View
              onLayout={(event) => {
                const width = Math.floor(event.nativeEvent.layout.width)
                setOrderDetailListWidth((current) => (current === width ? current : width))
              }}
              style={styles.orderDetailListCard}
            >
              {selectedOrder.items.map((line, index) => (
                <View
                  key={`${selectedOrder.orderId}-${line.itemId}-${index}`}
                  style={[styles.orderDetailListRow, index < selectedOrder.items.length - 1 && styles.orderDetailListRowDivider]}
                >
                  <View
                    style={[
                      styles.orderDetailItemImageWrap,
                      {
                        width: orderDetailLayout.imageSize,
                        height: orderDetailLayout.imageSize,
                      },
                    ]}
                  >
                    <ImageBackground
                      accessibilityIgnoresInvertColors
                      onError={() => {
                        markItemImageUnavailable(line.itemId)
                      }}
                      resizeMode="cover"
                      source={{
                        uri: resolveItemImageUri(
                          line.itemId,
                          orderDetailLayout.imageRequestSize,
                          orderDetailLayout.imageRequestSize,
                        ),
                      }}
                      style={[
                        styles.orderDetailItemImage,
                        {
                          backgroundColor: placeholderColor(line.itemId),
                          width: orderDetailLayout.imageSize,
                          height: orderDetailLayout.imageSize,
                        },
                      ]}
                      imageStyle={styles.orderDetailItemImageAsset}
                    >
                      {renderSpeciesBadge(line.itemId)}
                    </ImageBackground>
                  </View>
                  <View style={styles.orderDetailListInfo}>
                    <Text
                      adjustsFontSizeToFit
                      minimumFontScale={0.84}
                      numberOfLines={orderDetailLayout.titleMaxLines}
                      style={[
                        styles.orderDetailItemTitle,
                        {
                          fontSize: orderDetailLayout.titleFontSize,
                          lineHeight: orderDetailLayout.titleLineHeight,
                        },
                      ]}
                    >
                      {resolveOrderItemDisplayName(line.itemId, line.itemName)}
                    </Text>
                    <Text
                      style={[
                        styles.orderDetailItemSubtitle,
                        {
                          fontSize: orderDetailLayout.subtitleFontSize,
                          lineHeight: orderDetailLayout.subtitleLineHeight,
                        },
                      ]}
                    >
                      {renderHebrewNumericRuns(`כמות: ${line.quantity} ${formatOrderUnitLabel(line.unit)}`)}
                    </Text>
                  </View>
                  <View style={[styles.orderDetailListPricing, { minWidth: orderDetailLayout.pricingMinWidth }]}>
                    <Text style={styles.orderDetailListLineTotal}>{formatCurrency(line.lineTotal, selectedOrder.currency)}</Text>
                    <Text style={styles.orderDetailListUnitPrice}>
                      {renderHebrewNumericRuns(
                        `${formatCurrency(line.quantity > 0 ? line.lineTotal / line.quantity : line.lineTotal, selectedOrder.currency)} ליח׳`,
                      )}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={!selectedOrder.canCancel || cancelingOrderId === selectedOrder.orderId}
            onPress={() => {
              void cancelOrder(selectedOrder.orderId)
            }}
            style={({ pressed }) => [
              styles.dangerButton,
              (!selectedOrder.canCancel || cancelingOrderId === selectedOrder.orderId || pressed) && styles.primaryButtonDisabled,
            ]}
          >
            {cancelingOrderId === selectedOrder.orderId ? (
              <ActivityIndicator color={palette.danger} />
            ) : (
              <Text style={styles.dangerButtonText}>ביטול הזמנה</Text>
            )}
          </Pressable>
          {selectedOrder.orderRef ? (
            <Text style={styles.orderDetailOrderRef}>{renderHebrewNumericRuns(`מספר הזמנה: ${selectedOrder.orderRef}`)}</Text>
          ) : null}
        </View>
      )
    }

    return (
      <View style={styles.tabSection} testID={AGENT_SCREEN_TEST_IDS.ordersList}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>הזמנות קודמות</Text>
          <Text style={styles.sectionMeta}>{renderHebrewNumericRuns(`${ordersTotal} הזמנות`)}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.customerFilterScroller}
          contentContainerStyle={styles.customerFilterContent}
        >
          {ORDER_DATE_FILTERS.map((filter) => {
            const isSelected = filter.id === activeOrderDateFilter
            return (
              <Pressable
                accessibilityRole="button"
                key={filter.id}
                onPress={() => {
                  setActiveOrderDateFilter(filter.id)
                }}
                style={({ pressed }) => [
                  styles.filterChip,
                  isSelected ? styles.filterChipSelected : styles.filterChipDefault,
                  pressed && styles.tabButtonPressed,
                ]}
              >
                <Text style={[styles.filterChipText, isSelected ? styles.filterChipTextSelected : styles.filterChipTextDefault]}>
                  {renderHebrewNumericRuns(filter.label)}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {renderBanner(getResilienceHint(isOrdersSlow, ordersError), Boolean(ordersError))}

        {isOrdersLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator />
            <Text style={styles.mutedText}>טוענים הזמנות…</Text>
          </View>
        ) : orders.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.mutedText}>לא נמצאו הזמנות שמתאימות לפילטרים שנבחרו.</Text>
          </View>
        ) : (
          <View style={styles.ordersList}>
            {orders.map((order) => (
              <View key={order.orderId}>
                {renderOrderPreviewCard(order, {
                  timeOnly: false,
                  onPress: () => {
                    setSelectedOrderId(order.orderId)
                  },
                })}
              </View>
            ))}
          </View>
        )}

        <View style={styles.paginationRow}>
          <Pressable
            accessibilityRole="button"
            disabled={ordersPage <= 1}
            onPress={() => {
              setOrdersPage((current) => Math.max(1, current - 1))
            }}
            style={({ pressed }) => [styles.outlineButtonSmall, (ordersPage <= 1 || pressed) && styles.primaryButtonDisabled]}
          >
            <Text style={styles.outlineButtonText}>עמוד קודם</Text>
          </Pressable>
          <Text style={styles.paginationText}>
            {renderHebrewNumericRuns(`עמוד ${ordersPage} מתוך ${ordersTotalPages}`)}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={ordersPage >= ordersTotalPages}
            onPress={() => {
              setOrdersPage((current) => Math.min(ordersTotalPages, current + 1))
            }}
            style={({ pressed }) => [
              styles.outlineButtonSmall,
              (ordersPage >= ordersTotalPages || pressed) && styles.primaryButtonDisabled,
            ]}
          >
            <Text style={styles.outlineButtonText}>עמוד הבא</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  const renderSettingsTab = (): React.JSX.Element => (
    <View style={styles.tabSection} testID={AGENT_SCREEN_TEST_IDS.settingsSync}>
      <View style={styles.settingsProfileCard}>
        <ImageBackground
          accessibilityIgnoresInvertColors
          source={{ uri: placeholderImageUri(profile?.id ?? profileDisplayName, 200, 200) }}
          style={styles.settingsAvatarPlaceholder}
          imageStyle={styles.settingsAvatarImage}
        >
          <View style={styles.settingsAvatarScrim}>
            <Text style={styles.settingsAvatarInitials}>{(profile?.name ?? 'אבי כהן').slice(0, 2)}</Text>
          </View>
        </ImageBackground>
        <View style={styles.settingsProfileMeta}>
          <Text style={styles.settingsProfileName}>{profile?.name ?? 'אבי כהן'}</Text>
          <Text style={styles.settingsProfileSub}>סוכן מכירות אזורי</Text>
        </View>
      </View>

      <View style={styles.settingsMetricsGrid}>
        <View style={styles.settingsMetricCard}>
          <Text style={styles.catalogMetricLabel}>סטטוס רשת</Text>
          <Text style={styles.catalogMetricValue}>מחובר</Text>
        </View>
        <View style={styles.settingsMetricCard}>
          <Text style={styles.catalogMetricLabel}>סנכרון ERP</Text>
          <Text style={styles.catalogMetricValue}>94%</Text>
        </View>
      </View>

      <View style={styles.panelSection}>
        <Text style={styles.panelTitle}>יעד מכירות חודשי</Text>
        <View style={styles.settingsGoalRow}>
          <TextInput
            accessibilityLabel="יעד מכירות חודשי"
            keyboardType="numeric"
            onChangeText={setMonthlyGoalDraft}
            placeholder="הזינו יעד בחודש"
            style={[styles.input, styles.settingsGoalInput]}
            value={monthlyGoalDraft}
          />
          <Pressable
            accessibilityRole="button"
            onPress={applyMonthlyGoal}
            style={({ pressed }) => [styles.primaryButtonSmall, pressed && styles.primaryButtonDisabled]}
          >
            <Text style={styles.primaryButtonText}>שמירה</Text>
          </Pressable>
        </View>
        {monthlyGoalError ? <Text style={styles.errorText}>{monthlyGoalError}</Text> : null}
        <Text style={styles.noticeText}>{renderHebrewNumericRuns(`יעד נוכחי: ${formatCurrency(monthlyGoalAmount, 'ILS')}`)}</Text>
      </View>

      <View style={styles.panelSection}>
        <Pressable accessibilityRole="button" style={styles.settingsMenuRow}>
          <View style={styles.settingsMenuLeading}>
            <MaterialIcons color={palette.textMuted} name="person" size={16} />
            <Text style={styles.settingsMenuLabel}>עריכת פרופיל</Text>
          </View>
          <MaterialIcons color={palette.outline} name="chevron-left" size={18} />
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.settingsMenuRow}>
          <View style={styles.settingsMenuLeading}>
            <MaterialIcons color={palette.textMuted} name="notifications-active" size={16} />
            <Text style={styles.settingsMenuLabel}>הגדרות התראות</Text>
          </View>
          <MaterialIcons color={palette.outline} name="chevron-left" size={18} />
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.settingsMenuRowLast}>
          <View style={styles.settingsMenuLeading}>
            <MaterialIcons color={palette.textMuted} name="language" size={16} />
            <Text style={styles.settingsMenuLabel}>שפת ממשק</Text>
          </View>
          <View style={styles.settingsMenuTrailing}>
            <Text style={styles.settingsMenuHint}>עברית</Text>
            <MaterialIcons color={palette.outline} name="chevron-left" size={18} />
          </View>
        </Pressable>
      </View>

      <View style={styles.panelSection}>
        <Text style={styles.panelTitle}>פרופיל סוכן</Text>
        <View style={styles.settingsRow}>
          <Text style={styles.settingsLabel}>שם</Text>
          <Text style={styles.settingsValue}>{profile?.name ?? 'לא זמין'}</Text>
        </View>
        <View style={styles.settingsRow}>
          <Text style={styles.settingsLabel}>טלפון</Text>
          <Text style={styles.settingsValue}>{profile?.phone ?? 'לא זמין'}</Text>
        </View>
        <View style={styles.settingsRow}>
          <Text style={styles.settingsLabel}>אימייל</Text>
          <Text style={styles.settingsValue}>{profile?.email ?? 'לא הוגדר'}</Text>
        </View>
      </View>

      <View style={styles.panelSection}>
        <Text style={styles.panelTitle}>הגדרות וסנכרון</Text>
        {renderBanner(getResilienceHint(isCustomersSlow, customersError), Boolean(customersError))}
        {renderBanner(getResilienceHint(isApprovedItemsSlow, approvedItemsError), Boolean(approvedItemsError))}
        {!customersError && !approvedItemsError && !isCustomersSlow && !isApprovedItemsSlow ? (
          <Text style={styles.noticeText}>המערכת מסונכרנת והנתונים מעודכנים.</Text>
        ) : null}
      </View>

      <View style={styles.settingsActionRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void loadCustomers()
          }}
          style={({ pressed }) => [styles.secondaryButtonLarge, pressed && styles.primaryButtonDisabled]}
        >
          <Text style={styles.secondaryButtonText}>{isCustomersLoading ? 'מסנכרן…' : 'רענון נתונים'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void signOut()
          }}
          style={({ pressed }) => [styles.dangerButton, pressed && styles.primaryButtonDisabled]}
        >
          <Text style={styles.dangerButtonText}>יציאה מהמערכת</Text>
        </Pressable>
      </View>
    </View>
  )

  const connectionWarning = customersError ?? approvedItemsError ?? ordersError ?? homeOrdersError
  const profileDisplayName = profile?.name ?? 'אבי כהן'

  const refreshActiveTab = useCallback(() => {
    if (activeTab === 'orders') {
      void loadOrders()
      return
    }
    if (activeTab === 'home') {
      void loadHomeOrdersSnapshot()
      return
    }
    void loadCustomers()
  }, [activeTab, loadCustomers, loadHomeOrdersSnapshot, loadOrders])

  return (
    <Animated.View style={[styles.container, { opacity: rootOpacity }]}>
      <Animated.View style={[styles.contentLayer, { opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] }]}>
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={[
            styles.contentScrollContainer,
            {
              paddingTop: Math.max(insets.top, spacing.sm),
              paddingBottom: 112 + Math.max(insets.bottom, spacing.sm),
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.brandOnlyBar, { marginTop: 0 }]}>
            <Text style={styles.brandOnlyText}>עואודה לשיווק בע״מ</Text>
          </View>
          {connectionWarning ? (
            <View style={styles.warningStrip}>
              <MaterialIcons color="#b91c1c" name="error-outline" size={16} />
              <Text style={styles.warningStripText}>שגיאה בחיבור לשרת. הנתונים המוצגים עשויים להיות לא מעודכנים.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  refreshActiveTab()
                }}
              >
                <Text style={styles.warningStripAction}>נסה שוב</Text>
              </Pressable>
            </View>
          ) : null}
          {(activeTab === 'customers' && !isCustomerDetailOpen) || (activeTab === 'orders' && !selectedOrder) ? (
            <View style={styles.searchBlock}>
              <MaterialIcons color={palette.secondary} name="search" size={18} style={styles.searchIcon} />
              <TextInput
                accessibilityLabel="חיפוש לקוחות"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={activeTab === 'orders' ? 'חיפוש לפי לקוח, קוד פריט או שם פריט...' : 'חיפוש לקוח...'}
                value={activeTab === 'orders' ? ordersSearchQuery : customerSearchQuery}
                onChangeText={(value) => {
                  if (activeTab === 'orders') {
                    setOrdersSearchQuery(value)
                    return
                  }
                  setCustomerSearchQuery(value)
                }}
                style={styles.searchInput}
              />
            </View>
          ) : null}
          {activeTab === 'home' ? renderDashboardTab() : null}
          {activeTab === 'customers' ? renderCustomersTab() : null}
          {activeTab === 'orders' ? renderOrdersTab() : null}
          {activeTab === 'settings' ? renderSettingsTab() : null}
        </ScrollView>
      </Animated.View>

      <Animated.View
        style={[
          styles.bottomTabs,
          {
            paddingBottom: spacing.md + Math.max(insets.bottom - spacing.xs, 0),
            transform: [{ translateY: headerTranslateY }],
          },
        ]}
      >
        {TAB_ITEMS.map((tab) => {
          const isActive = tab.id === activeTab

          return (
            <Pressable
              accessibilityRole="button"
              key={tab.id}
              onPress={() => {
                setIsCustomerDetailOpen(false)
                setSelectedOrderId(null)
                setCustomerSearchQuery('')
                setActiveCustomerFilter('all')
                setOrdersSearchQuery('')
                setActiveOrderDateFilter('all')
                setOrdersPage(1)
                setCatalogPage(1)
                setMonthlyGoalDraft(String(monthlyGoalAmount))
                setMonthlyGoalError(null)
                setActiveTab(tab.id)
              }}
              style={({ pressed }) => [styles.tabButton, isActive && styles.tabButtonActive, pressed && styles.tabButtonPressed]}
            >
              <MaterialIcons color={isActive ? '#fff' : palette.textMuted} name={tab.icon} size={18} style={styles.tabIcon} />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          )
        })}
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  contentLayer: {
    flex: 1,
  },
  warningStrip: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  warningStripText: {
    flex: 1,
    color: '#7f1d1d',
    fontSize: 11,
    fontWeight: '700',
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
  },
  warningStripAction: {
    color: '#7f1d1d',
    fontSize: 11,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  brandOnlyBar: {
    marginHorizontal: 0,
    marginBottom: spacing.sm,
    marginTop: 0,
    paddingTop: 0,
    paddingHorizontal: spacing.md,
    minHeight: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surface,
    justifyContent: 'center',
  },
  brandOnlyText: {
    color: palette.primaryContainer,
    fontSize: scaledFont(22),
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
  },
  searchBlock: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.outline,
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    minHeight: touchTarget.comfortable,
  },
  searchIcon: {
    marginHorizontal: 6,
    color: palette.secondary,
    fontSize: 17,
  },
  searchInput: {
    flex: 1,
    color: palette.text,
    fontSize: 15,
    paddingVertical: 10,
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
  },
  contentScroll: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  contentScrollContainer: {
    paddingBottom: 112,
    gap: spacing.md,
  },
  tabSection: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: scaledFont(20),
    color: palette.primary,
    fontWeight: '800',
  },
  sectionMeta: {
    color: palette.secondary,
    fontWeight: '600',
    fontSize: scaledFont(12),
    fontVariant: ['tabular-nums'],
  },
  kpiGrid: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    gap: spacing.sm,
  },
  dashboardHeroCard: {
    borderRadius: radius.lg,
    backgroundColor: palette.primaryContainer,
    padding: spacing.lg,
    gap: spacing.xs,
    shadowColor: palette.primaryContainer,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  dashboardHeroLabel: {
    color: '#fecaca',
    fontSize: 12,
    fontWeight: '700',
  },
  dashboardHeroValue: {
    color: '#fff',
    fontSize: scaledFont(28),
    fontWeight: '800',
    fontFamily: NUMERIC_FONT_FAMILY,
  },
  dashboardHeroMetaRow: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dashboardHeroMeta: {
    color: '#fecaca',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: NUMERIC_FONT_FAMILY,
    fontVariant: ['tabular-nums'],
  },
  kpiCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.outline,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    padding: spacing.md,
    gap: 6,
  },
  kpiHeader: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  kpiLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  kpiValue: {
    color: palette.primaryContainer,
    fontSize: scaledFont(18),
    fontWeight: '800',
    fontFamily: NUMERIC_FONT_FAMILY,
    fontVariant: ['tabular-nums'],
  },
  kpiMeta: {
    color: palette.secondary,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: NUMERIC_FONT_FAMILY,
    fontVariant: ['tabular-nums'],
  },
  homeOrdersList: {
    gap: spacing.sm,
  },
  homeOrderRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surfaceLow,
    padding: spacing.md,
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  homeOrderTextGroup: {
    flex: 1,
    gap: 2,
  },
  homeOrderTitle: {
    color: palette.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  homeOrderAmount: {
    color: palette.primaryContainer,
    fontSize: 16,
    fontWeight: '800',
    fontFamily: NUMERIC_FONT_FAMILY,
    fontVariant: ['tabular-nums'],
  },
  panelSection: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.outline,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  panelTitle: {
    color: palette.primary,
    fontWeight: '700',
    fontSize: scaledFont(15),
  },
  catalogMetricLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  catalogMetricValue: {
    color: palette.primaryContainer,
    fontSize: 20,
    fontWeight: '800',
    fontFamily: NUMERIC_FONT_FAMILY,
    fontVariant: ['tabular-nums'],
  },
  catalogCardList: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: spacing.sm,
  },
  catalogItemCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surface,
    overflow: 'hidden',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  catalogItemHeader: {
    minHeight: 44,
  },
  catalogItemImagePlaceholder: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
  },
  catalogItemImageAsset: {
    borderRadius: radius.sm,
  },
  catalogItemTitleEnhanced: {
    color: palette.primary,
    fontSize: scaledFont(16),
    fontWeight: '800',
    lineHeight: scaledFont(21),
    flexShrink: 1,
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
  },
  catalogItemMetaEnhanced: {
    color: palette.secondary,
    fontSize: scaledFont(13),
    fontWeight: '700',
    lineHeight: scaledFont(17),
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
  },
  catalogPaginationRow: {
    marginTop: spacing.sm,
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  catalogPaginationLabel: {
    flex: 1,
    color: palette.textMuted,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '700',
  },
  customerListSection: {
    gap: spacing.sm,
  },
  customerFilterScroller: {
    maxHeight: 44,
  },
  customerFilterContent: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 2,
  },
  filterChip: {
    borderRadius: radius.pill,
    minHeight: 36,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipSelected: {
    backgroundColor: palette.primaryContainer,
  },
  filterChipDefault: {
    backgroundColor: palette.surfaceMid,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextSelected: {
    color: '#fff',
  },
  filterChipTextDefault: {
    color: palette.secondary,
  },
  customerGrid: {
    gap: spacing.md,
  },
  customerCard: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.outline,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  customerCardPrimaryBorder: {
    borderRightWidth: 4,
    borderRightColor: palette.primaryContainer,
  },
  customerCardSecondaryBorder: {
    borderRightWidth: 4,
    borderRightColor: palette.secondary,
  },
  customerCardCompact: {
    padding: spacing.md,
  },
  customerCardTapArea: {
    gap: spacing.sm,
  },
  customerCardPressed: {
    opacity: 0.88,
  },
  customerCardHeader: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerCode: {
    color: palette.secondary,
    fontWeight: '700',
    fontSize: 12,
  },
  statusRow: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
  },
  statusDotSuccess: {
    backgroundColor: palette.success,
  },
  statusDotWarning: {
    backgroundColor: palette.warning,
  },
  statusText: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  customerId: {
    color: palette.primary,
    fontSize: scaledFont(20),
    fontWeight: '800',
    lineHeight: 30,
  },
  customerMeta: {
    color: palette.textMuted,
    fontSize: 14,
  },
  customerActionRow: {
    marginTop: spacing.sm,
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    gap: spacing.sm,
  },
  customerActionStack: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  customerToggle: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerToggleText: {
    color: palette.secondary,
    fontWeight: '800',
    fontSize: 14,
  },
  customerExpandedSection: {
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: palette.outline,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  customerDetailGrid: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  customerDetailCell: {
    flexGrow: 1,
    minWidth: 132,
    gap: 2,
  },
  customerDetailLabel: {
    color: palette.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  customerDetailValue: {
    color: palette.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  detailBackButton: {
    alignSelf: IS_RTL_LAYOUT ? 'flex-end' : 'flex-start',
    minHeight: touchTarget.min,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  detailBackButtonText: {
    color: palette.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
  customerNameCard: {
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.outline,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 140,
  },
  customerNameCardTitle: {
    color: palette.primary,
    fontSize: scaledFont(28),
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 42,
  },
  customerNameCardSubtitle: {
    color: palette.secondary,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  detailInfoGrid: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    gap: spacing.sm,
  },
  detailInfoCard: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  detailInfoAction: {
    alignSelf: IS_RTL_LAYOUT ? 'flex-end' : 'flex-start',
  },
  customerDetailValueLink: {
    color: palette.primaryContainer,
    fontSize: 17,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  detailTitle: {
    color: palette.primary,
    fontSize: 24,
    fontWeight: '800',
  },
  ordersList: {
    gap: spacing.sm,
  },
  orderCard: {
    borderRadius: radius.md,
    backgroundColor: '#f1f2f4',
    borderWidth: 1,
    borderColor: palette.outline,
    padding: spacing.sm,
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  orderHeader: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#8d1b2c',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  orderTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: scaledFont(14),
    lineHeight: scaledFont(18),
    flex: 1,
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
  },
  orderTotal: {
    color: '#f4d9dd',
    fontWeight: '800',
    fontSize: scaledFont(11),
    lineHeight: scaledFont(14),
    fontFamily: NUMERIC_FONT_FAMILY,
    fontVariant: ['tabular-nums'],
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
  },
  orderSummaryMetaRow: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  orderMeta: {
    color: palette.secondary,
    fontSize: 14,
    fontWeight: '700',
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
  },
  orderMetaStrong: {
    color: '#0f766e',
    fontSize: 15,
    fontWeight: '800',
    fontFamily: NUMERIC_FONT_FAMILY,
    fontVariant: ['tabular-nums'],
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
  },
  orderPreviewItems: {
    gap: spacing.sm,
  },
  orderPreviewItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#dde0e4',
    backgroundColor: '#ffffff',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  orderPreviewItemImageWrap: {
    position: 'relative',
    width: 84,
    height: 84,
  },
  orderPreviewItemImage: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  orderPreviewItemImageAsset: {
    borderRadius: radius.md,
  },
  orderPreviewItemContent: {
    flex: 1,
    gap: 4,
    alignItems: IS_RTL_LAYOUT ? 'flex-end' : 'flex-start',
  },
  orderPreviewItemName: {
    color: palette.primary,
    fontSize: scaledFont(13),
    fontWeight: '800',
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
  },
  orderPreviewItemQuantity: {
    color: palette.primaryContainer,
    fontSize: scaledFont(12),
    fontWeight: '800',
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
  },
  orderPreviewMetricsRow: {
    width: '100%',
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  orderPreviewMetric: {
    gap: 2,
    alignItems: IS_RTL_LAYOUT ? 'flex-end' : 'flex-start',
  },
  orderPreviewMetricLabel: {
    color: palette.textMuted,
    fontSize: scaledFont(11),
    fontWeight: '700',
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
  },
  orderPreviewMetricValue: {
    color: palette.primary,
    fontSize: scaledFont(16),
    fontWeight: '800',
    fontFamily: NUMERIC_FONT_FAMILY,
    fontVariant: ['tabular-nums'],
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
  },
  orderThumbBadge: {
    position: 'absolute',
    top: -4,
    right: IS_RTL_LAYOUT ? undefined : -4,
    left: IS_RTL_LAYOUT ? -4 : undefined,
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: palette.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  orderThumbBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  orderDetailHeroCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  orderDetailRestaurant: {
    color: palette.primary,
    fontSize: scaledFont(22),
    fontWeight: '800',
  },
  orderDetailDate: {
    color: palette.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
  orderDetailTotal: {
    color: palette.primaryContainer,
    fontSize: scaledFont(20),
    fontWeight: '800',
    fontFamily: NUMERIC_FONT_FAMILY,
    fontVariant: ['tabular-nums'],
  },
  orderDetailStatusPill: {
    alignSelf: IS_RTL_LAYOUT ? 'flex-end' : 'flex-start',
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceLow,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  orderDetailStatusText: {
    color: palette.primaryContainer,
    fontSize: 12,
    fontWeight: '800',
  },
  orderDetailListCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: '#f3f4f6',
    overflow: 'hidden',
  },
  orderDetailListRow: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  orderDetailListRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: palette.outline,
  },
  orderDetailItemImageWrap: {
    position: 'relative',
    width: 96,
    height: 96,
  },
  orderDetailItemImage: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  orderDetailItemImageAsset: {
    borderRadius: radius.md,
  },
  orderDetailListInfo: {
    flex: 1,
    gap: 4,
    alignItems: IS_RTL_LAYOUT ? 'flex-end' : 'flex-start',
  },
  orderDetailListPricing: {
    minWidth: 92,
    gap: 4,
    alignItems: IS_RTL_LAYOUT ? 'flex-start' : 'flex-end',
  },
  orderDetailItemTitle: {
    color: palette.primary,
    fontSize: scaledFont(14),
    fontWeight: '800',
    flexShrink: 1,
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
  },
  orderDetailItemSubtitle: {
    color: '#8f8b87',
    fontSize: scaledFont(11),
    fontWeight: '700',
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
  },
  orderDetailListLineTotal: {
    color: palette.primaryContainer,
    fontSize: scaledFont(18),
    fontWeight: '800',
    fontFamily: NUMERIC_FONT_FAMILY,
    fontVariant: ['tabular-nums'],
    textAlign: IS_RTL_LAYOUT ? 'left' : 'right',
  },
  orderDetailListUnitPrice: {
    color: '#9a9896',
    fontSize: scaledFont(12),
    fontWeight: '700',
    textAlign: IS_RTL_LAYOUT ? 'left' : 'right',
  },
  orderDetailOrderRef: {
    textAlign: 'center',
    color: palette.textMuted,
    fontSize: scaledFont(11),
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  speciesBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 2,
  },
  speciesBadgeSmall: {
    width: 20,
    height: 20,
  },
  speciesBadgeBeef: {
    backgroundColor: '#8b1f34',
  },
  speciesBadgeChicken: {
    backgroundColor: '#b45309',
  },
  speciesBadgeLamb: {
    backgroundColor: '#6d28d9',
  },
  paginationRow: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  paginationText: {
    color: palette.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.outline,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: touchTarget.comfortable,
    backgroundColor: palette.surface,
    color: palette.text,
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
  },
  settingsRow: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  settingsLabel: {
    color: palette.textMuted,
    fontSize: 13,
  },
  settingsValue: {
    color: palette.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  settingsActionRow: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    gap: spacing.sm,
  },
  settingsGoalRow: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingsGoalInput: {
    flex: 1,
  },
  settingsProfileCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surface,
    padding: spacing.lg,
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  settingsAvatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  settingsAvatarImage: {
    borderRadius: radius.pill,
  },
  settingsAvatarScrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28, 25, 23, 0.3)',
  },
  settingsAvatarInitials: {
    color: palette.primaryContainer,
    fontSize: 20,
    fontWeight: '800',
  },
  settingsProfileMeta: {
    flex: 1,
    gap: 2,
  },
  settingsProfileName: {
    color: palette.primary,
    fontSize: scaledFont(18),
    fontWeight: '800',
  },
  settingsProfileSub: {
    color: palette.textMuted,
    fontSize: 12,
  },
  settingsMetricsGrid: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    gap: spacing.sm,
  },
  settingsMetricCard: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  settingsMenuRow: {
    minHeight: 46,
    borderBottomWidth: 1,
    borderBottomColor: palette.outline,
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  settingsMenuRowLast: {
    minHeight: 46,
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  settingsMenuLeading: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingsMenuLabel: {
    color: palette.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  settingsMenuTrailing: {
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  settingsMenuHint: {
    color: palette.textMuted,
    fontSize: 11,
  },
  loadingState: {
    minHeight: 88,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  emptyState: {
    minHeight: 88,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  mutedText: {
    color: palette.textMuted,
    textAlign: IS_RTL_LAYOUT ? 'right' : 'left',
    writingDirection: IS_RTL_LAYOUT ? 'rtl' : 'ltr',
  },
  primaryButton: {
    borderRadius: radius.md,
    minHeight: touchTarget.comfortable,
    backgroundColor: palette.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primaryButtonSmall: {
    borderRadius: radius.md,
    minHeight: touchTarget.min,
    backgroundColor: palette.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    flex: 1,
  },
  primaryButtonSmallWide: {
    borderRadius: radius.md,
    minHeight: touchTarget.min,
    backgroundColor: palette.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  secondaryButtonSmall: {
    borderRadius: radius.md,
    minHeight: touchTarget.min,
    backgroundColor: palette.secondaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    flex: 1,
    borderColor: palette.outline,
    borderWidth: 1,
  },
  outlineButtonSmall: {
    borderRadius: radius.md,
    minHeight: touchTarget.min,
    borderWidth: 1,
    borderColor: palette.outline,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    flex: 1,
    backgroundColor: palette.surface,
  },
  outlineButtonText: {
    color: palette.secondary,
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  secondaryButtonLarge: {
    borderRadius: radius.md,
    minHeight: touchTarget.comfortable,
    backgroundColor: palette.secondaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    flex: 1,
  },
  dangerButton: {
    borderRadius: radius.md,
    minHeight: touchTarget.comfortable,
    backgroundColor: palette.dangerSurface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    flex: 1,
  },
  dangerButtonText: {
    color: palette.danger,
    fontWeight: '700',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  secondaryButtonText: {
    color: palette.primary,
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  linkButtonInline: {
    minHeight: touchTarget.min,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    alignSelf: IS_RTL_LAYOUT ? 'flex-end' : 'flex-start',
  },
  linkButtonDisabled: {
    opacity: 0.65,
  },
  linkButtonText: {
    color: palette.primaryContainer,
    fontWeight: '600',
    fontSize: 13,
  },
  errorBanner: {
    backgroundColor: palette.dangerSurface,
    borderRadius: radius.sm,
    padding: 10,
    color: palette.danger,
    fontSize: 13,
  },
  noticeBanner: {
    backgroundColor: '#f6efe5',
    borderRadius: radius.sm,
    padding: 10,
    color: palette.warning,
    fontSize: 13,
  },
  errorText: {
    color: palette.danger,
    fontSize: 13,
  },
  noticeText: {
    color: palette.warning,
    fontSize: 13,
  },
  inlineNumericRun: {
    fontFamily: NUMERIC_FONT_FAMILY,
    fontVariant: ['tabular-nums'],
    writingDirection: 'ltr',
  },
  linkMetaCard: {
    marginTop: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surfaceLow,
    padding: spacing.md,
    gap: 2,
  },
  linkMetaTitle: {
    color: palette.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  linkMetaValue: {
    color: palette.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  linkMetaHint: {
    color: palette.textMuted,
    fontSize: 12,
  },
  bottomTabs: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderColor: palette.outline,
    flexDirection: IS_RTL_LAYOUT ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tabButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabButtonActive: {
    backgroundColor: palette.primaryContainer,
  },
  tabButtonPressed: {
    opacity: 0.72,
  },
  tabLabel: {
    color: palette.secondary,
    fontSize: 11,
    fontWeight: '600',
  },
  tabIcon: {
    color: palette.secondary,
    fontSize: 18,
    lineHeight: 18,
  },
  tabLabelActive: {
    color: '#fff',
  },
})
