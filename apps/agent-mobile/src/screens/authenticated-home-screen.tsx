import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MaterialIcons } from '@expo/vector-icons'
import {
  ActivityIndicator,
  Animated,
  Easing,
  ImageBackground,
  I18nManager,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import type {
  AgentApprovedItem,
  AgentAssignedCustomer,
  AgentMagicLinkIssueResponse,
  AgentOrderCard,
} from '@meatland/shared-types'

import {
  addApprovedItem,
  cancelAgentOrder,
  generateMagicLink,
  listAgentOrders,
  listApprovedItems,
  listAssignedCustomers,
} from '../api/agent-customers-client'
import { useAuth } from '../auth/auth-provider'
import { palette, radius, spacing, touchTarget } from '../theme/tokens'
import {
  type AgentDashboardTabId,
  applyApprovedCountMutation,
  buildMagicLinkShareMessage,
  buildRecentTransactions,
  buildWhatsAppDeepLink,
  formatApprovedItemTimestamp,
  formatLastOrderLabel,
  formatMagicLinkExpiry,
  getResilienceHint,
  mergeApprovedItems,
  normalizeMagicLinkForShare,
  shouldUseCopyLinkFallback,
  magicLinkLifecycleLabel,
} from './agent-dashboard-presenter'
import {
  getCurrentTimeLabel,
  placeholderColor,
  placeholderImageUri,
  placeholderSeed,
} from './authenticated-home-screen.helpers'
import { AGENT_SCREEN_TEST_IDS } from './agent-screen-ids'

const SLOW_NETWORK_THRESHOLD_MS = 1800

const TAB_ITEMS: Array<{ id: AgentDashboardTabId; label: string; icon: React.ComponentProps<typeof MaterialIcons>['name'] }> = [
  { id: 'home', label: 'בית', icon: 'home' },
  { id: 'customers', label: 'לקוחות', icon: 'group' },
  { id: 'catalog', label: 'קטלוג', icon: 'menu-book' },
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

function getCustomerStatus(customer: AgentAssignedCustomer): { label: string; tone: 'success' | 'warning' } {
  if (customer.approvedItemsCount === 0) {
    return { label: 'דורש פעולה', tone: 'warning' }
  }

  return { label: 'פעיל', tone: 'success' }
}

function getTransactionDotColor(kind: ReturnType<typeof buildRecentTransactions>[number]['kind']): string {
  if (kind === 'magic_link') {
    return palette.primaryContainer
  }
  if (kind === 'approved_item') {
    return palette.secondary
  }

  return palette.success
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

function humanizeItemName(itemId: string): string {
  const cleaned = itemId.replace(/^itm-/, '').replaceAll('-', ' ').trim()
  return toTitleCase(cleaned) || itemId
}

function formatCurrency(value: number, currency: string): string {
  if (currency === 'ILS') {
    return `₪${value.toFixed(2)}`
  }

  return `${value.toFixed(2)} ${currency}`
}

function estimateCatalogUnitPrice(itemId: string): number {
  const hashSeed = itemId.split('').reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0)
  return 95 + (hashSeed % 9) * 17
}

function initialsFromLabel(label: string): string {
  return (
    label
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((chunk) => chunk.charAt(0).toUpperCase())
      .join('') || 'ML'
  )
}

function customerBadgeLabel(customerId: string, approvedItemsCount: number): string {
  if (approvedItemsCount === 0) {
    return 'חדש'
  }

  return placeholderSeed(customerId) % 2 === 0 ? 'פרימיום' : 'פעיל'
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

export function AuthenticatedHomeScreen(): React.JSX.Element {
  const { signOut, profile, token } = useAuth()
  const [activeTab, setActiveTab] = useState<AgentDashboardTabId>('home')
  const [customerSearchQuery, setCustomerSearchQuery] = useState('')
  const [ordersSearchQuery, setOrdersSearchQuery] = useState('')
  const [activeCustomerFilter, setActiveCustomerFilter] = useState<CustomerFilterId>('all')
  const [expandedCustomerIds, setExpandedCustomerIds] = useState<string[]>([])

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

  const [newItemId, setNewItemId] = useState('')
  const [isAddingItem, setIsAddingItem] = useState(false)
  const [isAddSlow, setIsAddSlow] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [addInfoMessage, setAddInfoMessage] = useState<string | null>(null)

  const [isGeneratingLink, setIsGeneratingLink] = useState(false)
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null)
  const [magicLinkInfo, setMagicLinkInfo] = useState<string | null>(null)
  const [latestMagicLink, setLatestMagicLink] = useState<AgentMagicLinkIssueResponse | null>(null)
  const [latestMagicLinkCustomerId, setLatestMagicLinkCustomerId] = useState<string | null>(null)
  const [latestMagicLinkIssuedAt, setLatestMagicLinkIssuedAt] = useState<string | null>(null)
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

  useEffect(() => {
    if (activeTab !== 'orders') {
      return
    }

    void loadOrders()
  }, [activeTab, loadOrders])

  useEffect(() => {
    setOrdersPage(1)
  }, [activeOrderDateFilter, ordersSearchQuery])

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.customerId === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
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

  const toggleCustomerExpanded = useCallback((customerId: string) => {
    setExpandedCustomerIds((current) =>
      current.includes(customerId) ? current.filter((id) => id !== customerId) : [...current, customerId],
    )
  }, [])

  const priorityQueueCustomers = useMemo(() => {
    return [...filteredCustomers]
      .sort((left, right) => {
        if (left.lastOrderAt && !right.lastOrderAt) {
          return 1
        }
        if (!left.lastOrderAt && right.lastOrderAt) {
          return -1
        }
        return left.approvedItemsCount - right.approvedItemsCount
      })
      .slice(0, 4)
  }, [filteredCustomers])

  const dashboardKpis = useMemo(() => {
    const activeCustomers = customers.filter((customer) => customer.approvedItemsCount > 0).length
  const dailySalesEstimate = (approvedItems.length * 850 + activeCustomers * 220).toLocaleString('he-IL')
    const targetProgress = customers.length === 0 ? 0 : Math.round((activeCustomers / customers.length) * 100)

    return [
      { id: 'sales', label: 'מכירות יומיות', value: `₪${dailySalesEstimate}`, meta: '+12% מאתמול', icon: 'payments' as const },
      { id: 'target', label: 'יעד חודשי', value: `${Math.max(0, Math.min(99, targetProgress))}%`, meta: 'התקדמות', icon: 'trending-up' as const },
      { id: 'active', label: 'לקוחות פעילים', value: `${activeCustomers}`, meta: 'פעילים כרגע', icon: 'group' as const },
    ]
  }, [approvedItems.length, customers])

  const recentTransactions = useMemo(
    () =>
      buildRecentTransactions({
        customers,
        approvedItems,
        selectedCustomerId,
        latestMagicLink,
        latestMagicLinkCustomerId,
        latestMagicLinkIssuedAt,
      }),
    [approvedItems, customers, latestMagicLink, latestMagicLinkCustomerId, latestMagicLinkIssuedAt, selectedCustomerId],
  )

  const submitApprovedItem = useCallback(async () => {
    if (!token) {
      setAddError('הסשן פג. התחברו מחדש.')
      return
    }

    if (!selectedCustomerId) {
      setAddError('בחרו לקוח לפני הוספת פריט מאושר.')
      return
    }

    setAddError(null)
    setAddInfoMessage(null)
    setIsAddingItem(true)
    const clearSlowState = beginSlowNetworkTimer(setIsAddSlow)

    try {
      const mutation = await addApprovedItem(token, selectedCustomerId, newItemId)
      setApprovedItems((current) => mergeApprovedItems(current, mutation))
      setCustomers((current) => applyApprovedCountMutation(current, selectedCustomerId, mutation.created))
      setNewItemId('')
      setAddInfoMessage(mutation.created ? 'הפריט נוסף בהצלחה.' : 'הפריט כבר קיים ברשימת הלקוח.')
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'לא הצלחנו להוסיף פריט מאושר.')
    } finally {
      clearSlowState()
      setIsAddingItem(false)
    }
  }, [beginSlowNetworkTimer, newItemId, selectedCustomerId, token])

  const openCustomerDetail = useCallback((customerId: string) => {
    setSelectedCustomerId(customerId)
    setIsCustomerDetailOpen(true)
    setActiveTab('customers')
    setAddError(null)
    setAddInfoMessage(null)
  }, [])

  const openCustomerOrders = useCallback((customerId: string) => {
    setSelectedCustomerId(customerId)
    setIsCustomerDetailOpen(false)
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
        generatedLink = normalizedPayload
        setLatestMagicLink(normalizedPayload)
        setLatestMagicLinkCustomerId(targetCustomerId)
        setLatestMagicLinkIssuedAt(new Date().toISOString())
        const message = buildMagicLinkShareMessage(targetCustomerId, normalizedPayload)
        const deepLink = buildWhatsAppDeepLink(message)
        const canOpenWhatsApp = await Linking.canOpenURL(deepLink)

        if (shouldUseCopyLinkFallback(canOpenWhatsApp)) {
          setPendingCopyLink(normalizedPayload.linkUrl)
          setMagicLinkError('וואטסאפ לא זמין במכשיר הזה. העתיקו את הקישור במקום.')
          return
        }

        await Linking.openURL(deepLink)
        setMagicLinkInfo(`הקישור נוצר ונשלח עבור ${targetCustomerId}.`)
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
        <Text style={styles.panelTitle}>שליחת קישור הזמנה</Text>
        <Pressable
          accessibilityRole="button"
          disabled={isGeneratingLink || !customerId}
          onPress={() => {
            void generateAndShareLink(customerId ?? undefined)
          }}
          style={({ pressed }) => [styles.primaryButton, (pressed || isGeneratingLink || !customerId) && styles.primaryButtonDisabled]}
        >
          {isGeneratingLink ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>יצירה ושליחה בוואטסאפ</Text>}
        </Pressable>
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
          <Text style={styles.customerMeta}>
            לקוח {latestMagicLinkCustomerId} · פג תוקף {formatMagicLinkExpiry(latestMagicLink.expiresAt)} · {magicLinkLifecycleLabel(latestMagicLink.lifecycle)}
          </Text>
        ) : null}
      </View>
    )
  }

  const renderCustomerInlineActions = (customerId: string, includeDetailAction = true): React.JSX.Element => {
    return (
      <View style={styles.customerActionStack}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void generateAndShareLink(customerId)
          }}
          style={({ pressed }) => [styles.primaryButtonSmallWide, pressed && styles.primaryButtonDisabled]}
        >
          <Text style={styles.primaryButtonText}>שלח לינק קסם</Text>
        </Pressable>
        <View style={styles.customerActionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              openCustomerOrders(customerId)
            }}
            style={({ pressed }) => [styles.secondaryButtonSmall, pressed && styles.primaryButtonDisabled]}
          >
            <Text style={styles.secondaryButtonText}>הזמנות</Text>
          </Pressable>
          {includeDetailAction ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                openCustomerDetail(customerId)
              }}
              style={({ pressed }) => [styles.outlineButtonSmall, pressed && styles.primaryButtonDisabled]}
            >
              <Text style={styles.outlineButtonText}>פרטים</Text>
            </Pressable>
          ) : null}
        </View>
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
                    {filter.label}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        ) : null}

        <View style={styles.customerGrid}>
          {filteredCustomers.map((customer) => {
            const status = getCustomerStatus(customer)
            const isExpanded = expandedCustomerIds.includes(customer.customerId)
            const hasRecentMagicLink = latestMagicLinkCustomerId === customer.customerId && latestMagicLink

            return (
              <View
                key={customer.customerId}
                style={[
                  styles.customerCard,
                  isCompact && styles.customerCardCompact,
                  status.tone === 'success' ? styles.customerCardPrimaryBorder : styles.customerCardSecondaryBorder,
                ]}
              >
                <View style={styles.customerCardHeader}>
                  <View style={styles.statusRow}>
                    <View style={[styles.statusDot, status.tone === 'success' ? styles.statusDotSuccess : styles.statusDotWarning]} />
                    <Text style={styles.statusText}>{status.label}</Text>
                  </View>
                  <Text style={styles.customerCode}>כרטיס לקוח</Text>
                </View>

                <View style={styles.customerNameRow}>
                  <Text style={styles.customerId}>{humanizeCustomerName(customer.customerId)}</Text>
                  <Text style={styles.customerBadge}>{customerBadgeLabel(customer.customerId, customer.approvedItemsCount)}</Text>
                </View>
                <Text style={styles.customerMeta}>חשבון עסקי פעיל</Text>
                <Text style={styles.customerMeta}>{customerCityLabel(customer.customerId)}</Text>
                <Text style={styles.customerMeta}>{formatLastOrderLabel(customer.lastOrderAt)}</Text>
                <Text style={styles.customerMeta}>פריטים מאושרים: {customer.approvedItemsCount}</Text>

                {isCompact ? (
                  <View style={styles.customerActionRow}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        void generateAndShareLink(customer.customerId)
                      }}
                      style={({ pressed }) => [styles.primaryButtonSmall, pressed && styles.primaryButtonDisabled]}
                    >
                      <Text style={styles.primaryButtonText}>שליחת קישור</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        openCustomerDetail(customer.customerId)
                      }}
                      style={({ pressed }) => [styles.secondaryButtonSmall, pressed && styles.primaryButtonDisabled]}
                    >
                      <Text style={styles.secondaryButtonText}>פרטי לקוח</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        toggleCustomerExpanded(customer.customerId)
                      }}
                      style={({ pressed }) => [styles.customerToggle, pressed && styles.linkButtonDisabled]}
                    >
                      <Text style={styles.customerToggleText}>{isExpanded ? 'הסתר פרטים' : 'הצג פרטים נוספים'}</Text>
                      <MaterialIcons color={palette.secondary} name={isExpanded ? 'expand-less' : 'expand-more'} size={18} />
                    </Pressable>

                    {isExpanded ? (
                      <View style={styles.customerExpandedSection}>
                        <View style={styles.customerDetailGrid}>
                          <View style={styles.customerDetailCell}>
                            <Text style={styles.customerDetailLabel}>שם לקוח</Text>
                            <Text style={styles.customerDetailValue}>{humanizeCustomerName(customer.customerId)}</Text>
                          </View>
                          <View style={styles.customerDetailCell}>
                            <Text style={styles.customerDetailLabel}>סטטוס קישור</Text>
                            <Text style={styles.customerDetailValue}>
                              {hasRecentMagicLink ? `נשלח לאחרונה • ${formatMagicLinkExpiry(latestMagicLink.expiresAt)}` : 'ממתין לשליחה'}
                            </Text>
                          </View>
                        </View>
                        {renderCustomerInlineActions(customer.customerId)}
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            )
          })}
        </View>
      </View>
    )
  }

  const renderDashboardTab = (): React.JSX.Element => (
    <View style={styles.tabSection} testID={AGENT_SCREEN_TEST_IDS.dashboard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>ביצועים היום</Text>
        <Text style={styles.sectionMeta}>עדכני ל-{getCurrentTimeLabel()}</Text>
      </View>
      <View style={styles.dashboardHeroCard}>
        <Text style={styles.dashboardHeroLabel}>{dashboardKpis[0]?.label ?? 'מכירות יומיות'}</Text>
        <Text style={styles.dashboardHeroValue}>{dashboardKpis[0]?.value ?? '₪0'}</Text>
        <View style={styles.dashboardHeroMetaRow}>
          <Text style={styles.dashboardHeroMeta}>{dashboardKpis[0]?.meta ?? ''}</Text>
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
          </View>
        ))}
      </View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>משימות דחופות</Text>
        <Text style={styles.sectionMeta}>{priorityQueueCustomers.length} משימות פתוחות</Text>
      </View>
      {priorityQueueCustomers.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.mutedText}>אין לקוחות בתור כרגע. אפשר לרענן או לבדוק חיפוש.</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.queueScrollerContent}
          style={styles.queueScroller}
        >
          {priorityQueueCustomers.map((customer) => (
            <View key={`queue-${customer.customerId}`} style={styles.queueCard}>
              <View style={styles.urgentIconChip}>
                <MaterialIcons color={palette.warning} name="priority-high" size={16} />
              </View>
              <Text style={styles.queueCardTitle}>{humanizeCustomerName(customer.customerId)}</Text>
              <Text style={styles.queueCardMeta}>{customerCityLabel(customer.customerId)}</Text>
              <Text style={styles.queueCardMeta}>{formatLastOrderLabel(customer.lastOrderAt)}</Text>
              <Text style={styles.queueCardMeta}>מאושרים: {customer.approvedItemsCount}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void generateAndShareLink(customer.customerId)
                }}
                style={({ pressed }) => [styles.primaryButtonSmall, pressed && styles.primaryButtonDisabled]}
              >
                <Text style={styles.primaryButtonText}>שלח קישור להזמנה</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.panelSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>פעילות אחרונה</Text>
          <MaterialIcons color={palette.secondary} name="history" size={18} />
        </View>

        {recentTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.mutedText}>אין עדיין תנועות אחרונות להצגה. ברגע שתשלחו קישורים או תעדכנו לקוחות הפעילות תופיע כאן.</Text>
          </View>
        ) : (
          <View style={styles.activityList}>
            {recentTransactions.map((transaction) => (
              <View key={transaction.id} style={styles.activityRow}>
                <View style={[styles.activityDot, { backgroundColor: getTransactionDotColor(transaction.kind) }]} />
                <View style={styles.activityTextGroup}>
                  <Text style={styles.activityTitle}>{transaction.title}</Text>
                  <Text style={styles.activityMeta}>{transaction.detail}</Text>
                </View>
                <Text style={styles.activityRef}>{transaction.reference}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <ImageBackground
        accessibilityIgnoresInvertColors
        source={{ uri: placeholderImageUri('premium-collection', 960, 360) }}
        style={styles.premiumBanner}
        imageStyle={styles.premiumBannerImage}
      >
        <View style={styles.premiumBannerOverlay}>
          <Text style={styles.premiumEyebrow}>קולקציית Meatland</Text>
          <Text style={styles.premiumTitle}>מבצעי השבוע</Text>
          <Text style={styles.premiumLink}>לצפייה בקטלוג</Text>
        </View>
      </ImageBackground>

      {renderCustomersList(true)}
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

    return (
      <View style={styles.tabSection} testID={AGENT_SCREEN_TEST_IDS.customerDetail}>
        <View style={styles.customerDetailHero}>
          <Text style={styles.customerDetailBadge}>מועדון Meatland</Text>
          <Text style={styles.detailTitle}>{humanizeCustomerName(selectedCustomer.customerId)}</Text>
          <Text style={styles.customerMeta}>חשבון עסקי פעיל</Text>
        </View>

        <View style={styles.detailInfoGrid}>
          <View style={styles.detailInfoCard}>
            <Text style={styles.customerDetailLabel}>טלפון ליצירת קשר</Text>
            <Text style={styles.customerDetailValue}>054-000-0000</Text>
          </View>
          <View style={styles.detailInfoCard}>
            <Text style={styles.customerDetailLabel}>כתובת העסק</Text>
            <Text style={styles.customerDetailValue}>{customerCityLabel(selectedCustomer.customerId)}</Text>
          </View>
        </View>

        <View style={styles.detailCard}>
          <View style={styles.customerCardHeader}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, status.tone === 'success' ? styles.statusDotSuccess : styles.statusDotWarning]} />
              <Text style={styles.statusText}>{status.label}</Text>
            </View>
            <Text style={styles.customerCode}>פרופיל לקוח פעיל</Text>
          </View>
          <Text style={styles.panelTitle}>סיכום הזמנה אחרונה</Text>
          <Text style={styles.customerMeta}>{humanizeCustomerName(selectedCustomer.customerId)}</Text>
          <Text style={styles.customerMeta}>{formatLastOrderLabel(selectedCustomer.lastOrderAt)}</Text>
          <Text style={styles.customerMeta}>סה״כ פריטים מאושרים: {selectedCustomer.approvedItemsCount}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              openCustomerOrders(selectedCustomer.customerId)
            }}
            style={({ pressed }) => [styles.secondaryButtonLarge, pressed && styles.primaryButtonDisabled]}
          >
            <Text style={styles.secondaryButtonText}>מעבר ללשונית הזמנות</Text>
          </Pressable>
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
              <View style={styles.approvedList}>
                {approvedItems.slice(0, 8).map((item) => (
                  <View key={`${item.hashItemId}-${item.createdAt}`} style={styles.approvedRowCard}>
                    <ImageBackground
                      accessibilityIgnoresInvertColors
                      source={{ uri: placeholderImageUri(item.hashItemId, 224, 224) }}
                      style={[styles.approvedImagePlaceholder, { backgroundColor: placeholderColor(item.hashItemId) }]}
                      imageStyle={styles.approvedImageAsset}
                    >
                      <View style={styles.approvedImageScrim}>
                        <MaterialIcons color="#fff" name="restaurant" size={18} />
                      </View>
                    </ImageBackground>
                    <View style={styles.approvedRowContent}>
                      <Text style={styles.approvedTitle}>{humanizeItemName(item.hashItemId)}</Text>
                      <Text style={styles.approvedMeta}>קוד פריט: {item.hashItemId}</Text>
                      <Text style={styles.approvedMeta}>{formatApprovedItemTimestamp(item.createdAt)}</Text>
                    </View>
                  </View>
                ))}
              </View>
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
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>לקוחות</Text>
        <Text style={styles.sectionMeta}>{filteredCustomers.length} לקוחות בתצוגה</Text>
      </View>
      {renderBanner(getResilienceHint(isCustomersSlow, customersError), Boolean(customersError))}
      {isCustomerDetailOpen ? renderCustomerDetail() : renderCustomersList()}
    </View>
  )

  const renderApprovedCatalogTab = (): React.JSX.Element => {
    const catalogRows = approvedItems.slice(0, 10).map((item) => {
      const unitPrice = estimateCatalogUnitPrice(item.hashItemId)
      return {
        ...item,
        unitPrice,
        quantity: 1,
        lineTotal: unitPrice,
      }
    })
    const estimatedTotal = catalogRows.reduce((accumulator, item) => accumulator + item.lineTotal, 0)

    return (
      <View style={styles.tabSection} testID={AGENT_SCREEN_TEST_IDS.approvedCatalog}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ניהול קטלוג מאושר</Text>
          <Text style={styles.sectionMeta}>{selectedCustomer ? humanizeCustomerName(selectedCustomer.customerId) : 'בחרו לקוח'}</Text>
        </View>

        <View style={styles.catalogWarningBanner}>
          <MaterialIcons color={palette.warning} name="warning" size={18} />
          <View style={styles.catalogWarningContent}>
            <Text style={styles.catalogWarningTitle}>חריגה במלאי זמין</Text>
            <Text style={styles.catalogWarningText}>שים לב: 3 פריטים בקטלוג אינם זמינים כרגע במחסן המרכזי. יש לעדכן כמויות.</Text>
          </View>
        </View>

        <View style={styles.catalogMetricGrid}>
          <View style={styles.catalogMetricCard}>
            <Text style={styles.catalogMetricLabel}>פריטים מאושרים</Text>
            <Text style={styles.catalogMetricValue}>{approvedItems.length}</Text>
          </View>
          <View style={styles.catalogMetricCard}>
            <Text style={styles.catalogMetricLabel}>סה״כ הזמנה</Text>
            <Text style={styles.catalogMetricValue}>{formatCurrency(estimatedTotal, 'ILS')}</Text>
          </View>
        </View>

        {isApprovedItemsLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator />
            <Text style={styles.mutedText}>טוענים פריטי קטלוג…</Text>
          </View>
        ) : catalogRows.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.mutedText}>עדיין אין פריטים בקטלוג המאושר עבור הלקוח הנבחר.</Text>
          </View>
        ) : (
          <View style={styles.catalogCardList}>
            {catalogRows.map((item, index) => (
              <View
                key={`${item.hashItemId}-${item.createdAt}`}
                style={[styles.catalogItemCard, index === 2 && styles.catalogItemCardUnavailable]}
              >
                <ImageBackground
                  accessibilityIgnoresInvertColors
                  source={{ uri: placeholderImageUri(item.hashItemId, 640, 280) }}
                  style={[styles.catalogItemImagePlaceholder, { backgroundColor: placeholderColor(item.hashItemId) }]}
                  imageStyle={styles.catalogItemImageAsset}
                >
                  <View style={styles.catalogItemImageScrim}>
                    <MaterialIcons color="#fff" name="menu-book" size={18} />
                  </View>
                </ImageBackground>
                <View style={styles.catalogItemHeader}>
                  <Text style={styles.catalogSku}>קוד פריט: {item.hashItemId}</Text>
                  <Text style={styles.catalogItemTitle}>{humanizeItemName(item.hashItemId)}</Text>
                </View>
                <Text style={styles.catalogItemMeta}>מחיר ליחידה: {formatCurrency(item.unitPrice, 'ILS')}</Text>
                <Text style={styles.catalogItemMeta}>עודכן: {formatApprovedItemTimestamp(item.createdAt)}</Text>
                {index === 2 ? (
                  <View style={styles.catalogUnavailableBadge}>
                    <Text style={styles.catalogUnavailableBadgeText}>לא זמין</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}

        <View style={styles.panelSection}>
          <Text style={styles.panelTitle}>הוספת פריט חדש לקטלוג</Text>
          <View style={styles.catalogAddRow}>
            <TextInput
              accessibilityLabel="הוספת פריט מאושר לקטלוג"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setNewItemId}
              placeholder="הכנס שם פריט או קוד פריט"
              style={styles.input}
              value={newItemId}
            />
            <Pressable
              accessibilityRole="button"
              disabled={isAddingItem}
              onPress={() => {
                void submitApprovedItem()
              }}
              style={({ pressed }) => [styles.catalogAddButton, (pressed || isAddingItem) && styles.primaryButtonDisabled]}
            >
              {isAddingItem ? <ActivityIndicator color="#fff" /> : <MaterialIcons color="#fff" name="add" size={18} />}
            </Pressable>
          </View>
          {renderBanner(addError, true)}
          {renderBanner(addInfoMessage)}
        </View>
      </View>
    )
  }

  const renderOrdersTab = (): React.JSX.Element => (
    <View style={styles.tabSection} testID={AGENT_SCREEN_TEST_IDS.ordersList}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>הזמנות קודמות</Text>
        <Text style={styles.sectionMeta}>{ordersTotal} הזמנות</Text>
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
                {filter.label}
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
            <View key={order.orderId} style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <View>
                  <Text style={styles.orderTitle}>{order.customerName}</Text>
                  <Text style={styles.orderMeta}>אסמכתה: {order.orderRef ?? order.orderId}</Text>
                  {!order.orderRef ? <Text style={styles.orderMeta}>קוד הזמנה פנימי: {order.orderId}</Text> : null}
                </View>
                <Text style={styles.orderTotal}>{formatCurrency(order.estimatedTotal, order.currency)}</Text>
              </View>
              <Text style={styles.orderMeta}>{new Date(order.submittedAt).toLocaleString('he-IL')}</Text>
              <Text style={styles.orderMeta}>סטטוס: {order.status === 'submitted' ? 'נשלח' : order.status === 'pending_retry' ? 'ממתין לאישור' : 'נכשל'}</Text>
              <View style={styles.orderItemsList}>
                {order.items.slice(0, 4).map((line, index) => (
                  <Text key={`${order.orderId}-${line.itemId}-${index}`} style={styles.orderItemLine}>
                    {line.itemName} · {line.quantity} {line.unit}
                  </Text>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={!order.canCancel || cancelingOrderId === order.orderId}
                onPress={() => {
                  void cancelOrder(order.orderId)
                }}
                style={({ pressed }) => [
                  styles.dangerButton,
                  (!order.canCancel || cancelingOrderId === order.orderId || pressed) && styles.primaryButtonDisabled,
                ]}
              >
                {cancelingOrderId === order.orderId ? (
                  <ActivityIndicator color={palette.danger} />
                ) : (
                  <Text style={styles.dangerButtonText}>ביטול הזמנה</Text>
                )}
              </Pressable>
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
          עמוד {ordersPage} מתוך {ordersTotalPages}
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

  const connectionWarning = customersError ?? approvedItemsError ?? ordersError
  const profileDisplayName = profile?.name ?? 'אבי כהן'
  const profileInitials = initialsFromLabel(profileDisplayName)

  const refreshActiveTab = useCallback(() => {
    if (activeTab === 'orders') {
      void loadOrders()
      return
    }
    void loadCustomers()
  }, [activeTab, loadCustomers, loadOrders])

  return (
    <Animated.View style={[styles.container, { opacity: rootOpacity }]}>
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
      <Animated.View style={[styles.topBar, { transform: [{ translateY: headerTranslateY }] }]}>
        <View style={styles.topBarIdentity}>
          <Text style={styles.brandEyebrow}>אפליקציית סוכנים</Text>
          <Text style={styles.title}>
            {activeTab === 'customers'
              ? isCustomerDetailOpen
                ? 'פרטי לקוח'
                : 'לקוחות'
              : activeTab === 'catalog'
                ? 'ניהול קטלוג מאושר'
                : activeTab === 'orders'
                  ? 'הזמנות'
                  : activeTab === 'settings'
                    ? 'הגדרות וסנכרון'
                     : 'MEATLAND'}
          </Text>
          <Text style={styles.subtitle}>{profileDisplayName}</Text>
          <Text style={styles.subtitleSecondary}>{activeTab === 'home' ? 'סוכן שטח מרכז' : 'ממשק מותאם למובייל'}</Text>
        </View>
        <View style={styles.topBarActions}>
          <ImageBackground
            accessibilityIgnoresInvertColors
            source={{ uri: placeholderImageUri(profile?.id ?? profileDisplayName, 160, 160) }}
            style={styles.profileAvatar}
            imageStyle={styles.profileAvatarImage}
          >
            <View style={styles.profileAvatarScrim}>
              <Text style={styles.profileAvatarText}>{profileInitials}</Text>
            </View>
          </ImageBackground>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              refreshActiveTab()
            }}
            style={({ pressed }) => [styles.refreshButton, (pressed || isCustomersLoading) && styles.linkButtonDisabled]}
          >
            <MaterialIcons color={palette.primaryContainer} name="sync" size={18} />
          </Pressable>
        </View>
      </Animated.View>

      {activeTab === 'customers' || activeTab === 'orders' ? (
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

      <Animated.View style={[styles.contentLayer, { opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] }]}>
        <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentScrollContainer} showsVerticalScrollIndicator={false}>
          {activeTab === 'home' ? renderDashboardTab() : null}
          {activeTab === 'customers' ? renderCustomersTab() : null}
          {activeTab === 'catalog' ? renderApprovedCatalogTab() : null}
          {activeTab === 'orders' ? renderOrdersTab() : null}
          {activeTab === 'settings' ? renderSettingsTab() : null}
        </ScrollView>
      </Animated.View>

      <Animated.View style={[styles.bottomTabs, { transform: [{ translateY: headerTranslateY }] }]}>
        {TAB_ITEMS.map((tab) => {
          const isActive = tab.id === activeTab

          return (
            <Pressable
              accessibilityRole="button"
              key={tab.id}
              onPress={() => {
                setActiveTab(tab.id)
                if (tab.id !== 'customers') {
                  setIsCustomerDetailOpen(false)
                }
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
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  warningStripIcon: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '700',
  },
  warningStripText: {
    flex: 1,
    color: '#7f1d1d',
    fontSize: 11,
    fontWeight: '700',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  warningStripAction: {
    color: '#7f1d1d',
    fontSize: 11,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  topBar: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.outline,
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  topBarIdentity: {
    flex: 1,
  },
  topBarActions: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandEyebrow: {
    color: palette.secondary,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 2,
    fontWeight: '700',
    alignSelf: 'flex-start',
  },
  title: {
    fontSize: 22,
    color: palette.primaryContainer,
    fontWeight: '800',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  subtitle: {
    marginTop: 2,
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '700',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  subtitleSecondary: {
    marginTop: 1,
    color: palette.textMuted,
    fontSize: 11,
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  refreshButton: {
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.outline,
  },
  profileAvatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.outline,
  },
  profileAvatarImage: {
    borderRadius: radius.pill,
  },
  profileAvatarScrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28, 25, 23, 0.34)',
  },
  profileAvatarText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  searchBlock: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.outline,
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    minHeight: touchTarget.comfortable,
  },
  searchIcon: {
    marginHorizontal: 6,
    color: palette.secondary,
    fontSize: 17,
  },
  iconPrimary: {
    color: palette.primaryContainer,
    fontSize: 18,
  },
  iconSecondary: {
    color: palette.secondary,
    fontSize: 18,
  },
  searchInput: {
    flex: 1,
    color: palette.text,
    fontSize: 15,
    paddingVertical: 10,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
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
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 24,
    color: palette.primary,
    fontWeight: '800',
  },
  sectionMeta: {
    color: palette.secondary,
    fontWeight: '600',
    fontSize: 13,
  },
  kpiGrid: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
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
    fontSize: 34,
    fontWeight: '900',
  },
  dashboardHeroMetaRow: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dashboardHeroMeta: {
    color: '#fecaca',
    fontSize: 11,
    fontWeight: '700',
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
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
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
    fontSize: 20,
    fontWeight: '800',
  },
  kpiMeta: {
    color: palette.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  queueScroller: {
    maxHeight: 220,
  },
  queueScrollerContent: {
    gap: spacing.md,
    paddingHorizontal: 2,
  },
  queueCard: {
    width: 290,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.outline,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  urgentIconChip: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: I18nManager.isRTL ? 'flex-end' : 'flex-start',
  },
  queueCardTitle: {
    color: palette.primary,
    fontWeight: '700',
    fontSize: 18,
  },
  queueCardMeta: {
    color: palette.textMuted,
    fontSize: 13,
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
    fontSize: 17,
  },
  premiumBanner: {
    minHeight: 128,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  premiumBannerImage: {
    borderRadius: radius.xl,
  },
  premiumBannerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: I18nManager.isRTL ? 'flex-end' : 'flex-start',
    backgroundColor: 'rgba(69, 10, 10, 0.7)',
    padding: spacing.lg,
    gap: 4,
  },
  premiumEyebrow: {
    color: '#fecaca',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  premiumTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  premiumLink: {
    color: '#fdba74',
    fontSize: 12,
    fontWeight: '700',
  },
  catalogWarningBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#f5d18f',
    backgroundColor: '#fff4dc',
    padding: spacing.md,
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  catalogWarningContent: {
    flex: 1,
    gap: 4,
  },
  catalogWarningTitle: {
    color: palette.warning,
    fontSize: 13,
    fontWeight: '800',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  catalogWarningText: {
    color: palette.warning,
    fontSize: 11,
    fontWeight: '600',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  catalogMetricGrid: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    gap: spacing.sm,
  },
  catalogMetricCard: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surface,
    padding: spacing.md,
    gap: spacing.xs,
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
  },
  catalogCardList: {
    gap: spacing.sm,
  },
  catalogItemCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  catalogItemCardUnavailable: {
    opacity: 0.75,
    borderColor: '#fecaca',
  },
  catalogItemHeader: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  catalogItemImagePlaceholder: {
    width: '100%',
    height: 96,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogItemImageAsset: {
    borderRadius: radius.md,
  },
  catalogItemImageScrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28, 25, 23, 0.24)',
    borderRadius: radius.md,
  },
  catalogSku: {
    color: palette.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  catalogItemTitle: {
    color: palette.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  catalogItemMeta: {
    color: palette.textMuted,
    fontSize: 12,
  },
  catalogUnavailableBadge: {
    alignSelf: I18nManager.isRTL ? 'flex-end' : 'flex-start',
    backgroundColor: '#e7e5e4',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  catalogUnavailableBadgeText: {
    color: '#78716c',
    fontSize: 11,
    fontWeight: '700',
  },
  catalogAddRow: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  catalogAddButton: {
    borderRadius: radius.md,
    minHeight: touchTarget.comfortable,
    minWidth: touchTarget.comfortable,
    backgroundColor: palette.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityList: {
    gap: spacing.sm,
  },
  activityRow: {
    backgroundColor: palette.surfaceLow,
    borderWidth: 1,
    borderColor: palette.outline,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  activityTextGroup: {
    flex: 1,
    gap: 2,
  },
  activityTitle: {
    color: palette.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  activityMeta: {
    color: palette.textMuted,
    fontSize: 12,
  },
  activityRef: {
    color: palette.primaryContainer,
    fontWeight: '700',
    fontSize: 12,
  },
  customerListSection: {
    gap: spacing.sm,
  },
  customerFilterScroller: {
    maxHeight: 44,
  },
  customerFilterContent: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
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
    padding: spacing.lg,
    gap: spacing.xs,
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
  customerCardHeader: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerCode: {
    color: palette.secondary,
    fontWeight: '600',
    fontSize: 11,
  },
  statusRow: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
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
    fontSize: 12,
    fontWeight: '600',
  },
  customerId: {
    color: palette.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  customerNameRow: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  customerBadge: {
    borderRadius: radius.pill,
    backgroundColor: palette.secondaryFixed,
    color: palette.secondary,
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  customerMeta: {
    color: palette.textMuted,
    fontSize: 13,
  },
  customerActionRow: {
    marginTop: spacing.sm,
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    gap: spacing.sm,
  },
  customerActionStack: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  customerToggle: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerToggleText: {
    color: palette.secondary,
    fontWeight: '700',
    fontSize: 13,
  },
  customerExpandedSection: {
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: palette.outline,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  customerDetailGrid: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
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
    fontSize: 13,
    fontWeight: '600',
  },
  detailCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.outline,
    gap: spacing.xs,
  },
  customerDetailHero: {
    borderRadius: radius.lg,
    backgroundColor: palette.primary,
    padding: spacing.lg,
    gap: 4,
  },
  customerDetailBadge: {
    alignSelf: I18nManager.isRTL ? 'flex-start' : 'flex-end',
    borderRadius: radius.pill,
    backgroundColor: palette.warning,
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  detailInfoGrid: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    gap: spacing.sm,
  },
  detailInfoCard: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surface,
    padding: spacing.md,
    gap: 4,
  },
  detailTitle: {
    color: palette.primary,
    fontSize: 24,
    fontWeight: '800',
  },
  detailActionRow: {
    marginTop: spacing.sm,
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    gap: spacing.sm,
  },
  approvedList: {
    gap: spacing.sm,
  },
  ordersList: {
    gap: spacing.sm,
  },
  orderCard: {
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.outline,
    padding: spacing.md,
    gap: spacing.xs,
  },
  orderHeader: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  orderTitle: {
    color: palette.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  orderTotal: {
    color: palette.primaryContainer,
    fontWeight: '800',
    fontSize: 15,
  },
  orderMeta: {
    color: palette.textMuted,
    fontSize: 12,
  },
  orderItemsList: {
    borderTopWidth: 1,
    borderTopColor: palette.outline,
    paddingTop: spacing.xs,
    gap: 2,
  },
  orderItemLine: {
    color: palette.primary,
    fontSize: 12,
  },
  paginationRow: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  paginationText: {
    color: palette.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  approvedRow: {
    borderRadius: radius.md,
    backgroundColor: palette.surfaceLow,
    borderWidth: 1,
    borderColor: palette.outline,
    padding: spacing.md,
    gap: 2,
  },
  approvedRowCard: {
    borderRadius: radius.md,
    backgroundColor: palette.surfaceLow,
    borderWidth: 1,
    borderColor: palette.outline,
    padding: spacing.sm,
    gap: spacing.sm,
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
  },
  approvedImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvedImageAsset: {
    borderRadius: radius.md,
  },
  approvedImageScrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28, 25, 23, 0.24)',
    borderRadius: radius.md,
  },
  approvedRowContent: {
    flex: 1,
    gap: 2,
  },
  approvedTitle: {
    color: palette.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  approvedMeta: {
    color: palette.textMuted,
    fontSize: 12,
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
    textAlign: I18nManager.isRTL ? 'right' : 'left',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
  },
  settingsRow: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
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
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    gap: spacing.sm,
  },
  settingsProfileCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.surface,
    padding: spacing.lg,
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
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
    fontSize: 20,
    fontWeight: '800',
  },
  settingsProfileSub: {
    color: palette.textMuted,
    fontSize: 12,
  },
  settingsMetricsGrid: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
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
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  settingsMenuRowLast: {
    minHeight: 46,
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  settingsMenuLeading: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingsMenuLabel: {
    color: palette.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  settingsMenuTrailing: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
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
    textAlign: I18nManager.isRTL ? 'right' : 'left',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
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
  backButton: {
    minHeight: touchTarget.min,
    borderRadius: radius.md,
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  linkButtonInline: {
    minHeight: touchTarget.min,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    alignSelf: 'flex-start',
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
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
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
  tabIconActive: {
    color: '#fff',
  },
  tabLabelActive: {
    color: '#fff',
  },
})
