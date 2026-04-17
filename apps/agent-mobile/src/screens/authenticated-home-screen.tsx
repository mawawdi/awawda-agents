import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons'
import {
  ActivityIndicator,
  Animated,
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
  SupervisorAgentAssignment,
  SupervisorAgentOverview,
  SupervisorAuditEntry,
  SupervisorCustomerOverview,
  SupervisorOversightResponse,
} from '@awawda/shared-types'

import {
  AgentApiError,
  cancelAgentOrder,
  generateMagicLink,
  listAgentOrders,
  listApprovedItems,
  listAssignedCustomers,
  assignSupervisorCustomer,
  createSupervisorAgent,
  forceLogoutSupervisorAgent,
  getSupervisorOversightSnapshot,
  listSupervisorAgents,
  listSupervisorAuditEntries,
  listSupervisorCustomerAssignments,
  listSupervisorCustomers,
  unassignSupervisorCustomer,
  updateSupervisorAgentAccess,
  updateSupervisorCustomerProfile,
} from '../api/agent-customers-client'
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
} from './authenticated-home-screen.helpers'
import {
  CATALOG_GRID_ROWS_PER_PAGE,
  CUSTOMER_FILTERS,
  DEFAULT_CUSTOMER_PHONE,
  FIELD_TAB_ITEMS,
  ORDERS_PAGE_SIZE,
  ORDER_DATE_FILTERS,
  SLOW_NETWORK_THRESHOLD_MS,
  SUPERVISOR_AGENT_ROLE_OPTIONS,
  SUPERVISOR_STATUS_OPTIONS,
  SUPERVISOR_TAB_ITEMS,
  SUPERVISOR_WORKSPACE_TABS,
  type CustomerFilterId,
  type OrderDateFilterId,
  type SupervisorCreateAgentDraft,
  type SupervisorProfileDraft,
  type SupervisorWorkspaceTabId,
} from './authenticated-home-screen.constants'
import { createSupervisorStyles } from './authenticated-home-screen.supervisor-styles'
import {
  SPECIES_BADGE_ICON_BY_SPECIES,
  customerCityLabel,
  estimateCatalogUnitPrice,
  formatCurrency,
  formatOrderDateTime,
  formatOrderTime,
  formatOrderUnitLabel,
  formatRelativeLastOrder,
  formatSupervisorAuditEvent,
  formatSupervisorAuditTime,
  formatSupervisorOrderStatus,
  formatSupervisorOversightRate,
  getCustomerStatus,
  getSupervisorCustomerStatus,
  humanizeCustomerName,
  humanizeItemName,
  inferItemSpecies,
  isTestingImageCandidateExhausted,
  moveToNextTestingImageCandidate,
  resolveCatalogGridCellDimension,
  resolveCatalogGridColumnCount,
  resolveCatalogMetaFontSize,
  resolveCatalogTitleLayout,
  resolveOrderDetailLayout,
  resolveOrderItemDisplayName,
  resolveTestingImageUriFromCandidates,
  scaledFont,
  sumOrdersEstimatedTotal,
  toDateFilterRange,
  toLocalDayEnd,
  toLocalDayStart,
  toSupervisorProfileDraft,
} from './authenticated-home-screen.utils'
import { AGENT_SCREEN_TEST_IDS } from './agent-screen-ids'

const IS_RTL_LAYOUT = true
const NUMERIC_FONT_FAMILY =
  Platform.select({
    web: '"Plus Jakarta Sans", system-ui, sans-serif',
    default: 'PlusJakartaSans_800ExtraBold',
  }) ?? 'PlusJakartaSans_800ExtraBold'
const HEBREW_CHAR_PATTERN = /[\u0590-\u05FF]/
const DIGIT_PATTERN = /\d/
const NUMERIC_TOKEN_PATTERN = /([₪$€£]?-?\d[\d,]*(?:\.\d+)?%?)/g
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

export function AuthenticatedHomeScreen(): React.JSX.Element {
  const { signOut, profile, token } = useAuth()
  const insets = useSafeAreaInsets()
  const isSupervisorRole = profile?.role === 'supervisor'
  const tabItems = isSupervisorRole ? SUPERVISOR_TAB_ITEMS : FIELD_TAB_ITEMS
  const [activeTab, setActiveTab] = useState<AgentDashboardTabId>(isSupervisorRole ? 'supervisor' : 'home')
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
  const latestOrdersFilterSignatureRef = useRef(`${activeOrderDateFilter}|${ordersSearchQuery.trim()}`)
  const [homeOrdersToday, setHomeOrdersToday] = useState<AgentOrderCard[]>([])
  const [isHomeOrdersLoading, setIsHomeOrdersLoading] = useState(false)
  const [homeOrdersError, setHomeOrdersError] = useState<string | null>(null)
  const [monthlySalesTotal, setMonthlySalesTotal] = useState(0)
  const [monthlyGoalAmount, setMonthlyGoalAmount] = useState(120_000)
  const [monthlyGoalDraft, setMonthlyGoalDraft] = useState('120000')
  const [monthlyGoalError, setMonthlyGoalError] = useState<string | null>(null)

  const [supervisorAgents, setSupervisorAgents] = useState<SupervisorAgentOverview[]>([])
  const [supervisorCustomers, setSupervisorCustomers] = useState<SupervisorCustomerOverview[]>([])
  const [supervisorOversight, setSupervisorOversight] = useState<SupervisorOversightResponse | null>(null)
  const [supervisorAssignments, setSupervisorAssignments] = useState<SupervisorAgentAssignment[]>([])
  const [supervisorAuditEntries, setSupervisorAuditEntries] = useState<SupervisorAuditEntry[]>([])
  const [supervisorCustomerSearchQuery, setSupervisorCustomerSearchQuery] = useState('')
  const [selectedSupervisorCustomerId, setSelectedSupervisorCustomerId] = useState<string | null>(null)
  const [isSupervisorCustomerDetailOpen, setIsSupervisorCustomerDetailOpen] = useState(false)
  const [selectedSupervisorAgentId, setSelectedSupervisorAgentId] = useState<string | null>(null)
  const [selectedSupervisorAccessAgentId, setSelectedSupervisorAccessAgentId] = useState<string | null>(null)
  const [supervisorCreateAgentDraft, setSupervisorCreateAgentDraft] = useState<SupervisorCreateAgentDraft>({
    name: '',
    phone: '',
    email: '',
    password: '',
    role: 'field_agent',
  })
  const [supervisorProfileDraft, setSupervisorProfileDraft] = useState<SupervisorProfileDraft>({
    name: '',
    contactName: '',
    phone: '',
    city: '',
    notes: '',
    status: 'active',
  })
  const [isSupervisorLoading, setIsSupervisorLoading] = useState(false)
  const [isSupervisorAuditLoading, setIsSupervisorAuditLoading] = useState(false)
  const [isSupervisorMutating, setIsSupervisorMutating] = useState(false)
  const [supervisorError, setSupervisorError] = useState<string | null>(null)
  const [supervisorInfo, setSupervisorInfo] = useState<string | null>(null)
  const [activeSupervisorWorkspaceTab, setActiveSupervisorWorkspaceTab] = useState<SupervisorWorkspaceTabId>('overview')

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

  useEffect(() => {
    if (isSupervisorRole) {
      if (activeTab !== 'supervisor' && activeTab !== 'settings') {
        setActiveTab('supervisor')
      }
      return
    }

    if (activeTab === 'supervisor') {
      setActiveTab('home')
    }
  }, [activeTab, isSupervisorRole])

  useEffect(() => {
    if (!isSupervisorRole) {
      setActiveSupervisorWorkspaceTab('overview')
    }
  }, [isSupervisorRole])

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
      if (error instanceof AgentApiError && error.status === 401) {
        await signOut()
        return
      }
      setCustomersError(error instanceof Error ? error.message : 'לא הצלחנו לטעון את רשימת הלקוחות.')
      setCustomers([])
      setSelectedCustomerId(null)
      setIsCustomerDetailOpen(false)
    } finally {
      clearSlowState()
      setIsCustomersLoading(false)
    }
  }, [beginSlowNetworkTimer, signOut, token])

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
      if (error instanceof AgentApiError && error.status === 401) {
        await signOut()
        return
      }
      setOrders([])
      setOrdersTotal(0)
      setOrdersTotalPages(1)
      setOrdersError(error instanceof Error ? error.message : 'לא הצלחנו לטעון את ההזמנות הקודמות.')
    } finally {
      clearSlowState()
      setIsOrdersLoading(false)
    }
  }, [activeOrderDateFilter, beginSlowNetworkTimer, ordersPage, ordersSearchQuery, signOut, token])

  const loadOrdersInRange = useCallback(
    async (fromDate: string, toDate: string): Promise<AgentOrderCard[]> => {
      if (!token) {
        return []
      }

      const aggregatedOrders: AgentOrderCard[] = []
      let page = 1
      let totalPages = 1

      while (page <= totalPages) {
        try {
          const response = await listAgentOrders(token, {
            page,
            pageSize: 50,
            fromDate,
            toDate,
          })
          aggregatedOrders.push(...response.orders)
          totalPages = response.totalPages
          page += 1
        } catch (error) {
          if (error instanceof AgentApiError && error.status === 401) {
            await signOut()
            return []
          }
          throw error
        }
      }

      return aggregatedOrders
    },
    [signOut, token],
  )

  const loadHomeOrdersSnapshot = useCallback(async () => {
    if (!token) {
      setHomeOrdersToday([])
      setMonthlySalesTotal(0)
      setHomeOrdersError('הסשן חסר. התחברו מחדש כדי להמשיך.')
      return
    }

    const today = new Date()
    const todayStartIso = toLocalDayStart(today).toISOString()
    const todayEndIso = toLocalDayEnd(today).toISOString()
    const monthStartIso = toLocalDayStart(new Date(today.getFullYear(), today.getMonth(), 1)).toISOString()

    setIsHomeOrdersLoading(true)
    setHomeOrdersError(null)

    try {
      const [todayOrders, monthOrders] = await Promise.all([
        loadOrdersInRange(todayStartIso, todayEndIso),
        loadOrdersInRange(monthStartIso, todayEndIso),
      ])

      setHomeOrdersToday(
        todayOrders.sort((left, right) => Date.parse(right.submittedAt) - Date.parse(left.submittedAt)),
      )
      setMonthlySalesTotal(sumOrdersEstimatedTotal(monthOrders))
    } catch (error) {
      if (error instanceof AgentApiError && error.status === 401) {
        await signOut()
        return
      }
      setHomeOrdersToday([])
      setMonthlySalesTotal(0)
      setHomeOrdersError(error instanceof Error ? error.message : 'לא הצלחנו לטעון את נתוני המכירות.')
    } finally {
      setIsHomeOrdersLoading(false)
    }
  }, [loadOrdersInRange, signOut, token])

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

  const loadSupervisorAuditLog = useCallback(
    async (customerId: string | null) => {
      if (!token) {
        setSupervisorAuditEntries([])
        setSupervisorError('הסשן חסר. התחברו מחדש כדי להמשיך.')
        return
      }

      setIsSupervisorAuditLoading(true)
      try {
        const response = await listSupervisorAuditEntries(token, {
          customerId: customerId ?? undefined,
          page: 1,
          pageSize: 20,
        })
        setSupervisorAuditEntries(response.entries)
      } catch (error) {
        if (error instanceof AgentApiError && error.status === 401) {
          await signOut()
          return
        }
        setSupervisorAuditEntries([])
        setSupervisorError(error instanceof Error ? error.message : 'לא הצלחנו לטעון את יומן הפעולות.')
      } finally {
        setIsSupervisorAuditLoading(false)
      }
    },
    [signOut, token],
  )

  const loadSupervisorData = useCallback(async () => {
    if (!token) {
      setSupervisorAgents([])
      setSupervisorCustomers([])
      setSupervisorOversight(null)
      setSupervisorAssignments([])
      setSupervisorAuditEntries([])
      setSelectedSupervisorCustomerId(null)
      setIsSupervisorCustomerDetailOpen(false)
      setSelectedSupervisorAgentId(null)
      setSelectedSupervisorAccessAgentId(null)
      setSupervisorError('הסשן חסר. התחברו מחדש כדי להמשיך.')
      return
    }

    setIsSupervisorLoading(true)
    setSupervisorError(null)

    try {
      const [agentsResponse, customersResponse, oversightResponse] = await Promise.all([
        listSupervisorAgents(token),
        listSupervisorCustomers(token),
        getSupervisorOversightSnapshot(token),
      ])

      const fieldAgents = agentsResponse.agents.filter((agent) => agent.role === 'field_agent')
      const assignableAgents = fieldAgents.filter((agent) => agent.isActive)
      setSupervisorAgents(agentsResponse.agents)
      setSupervisorCustomers(customersResponse.customers)
      setSupervisorOversight(oversightResponse)
      setSelectedSupervisorCustomerId((current) => {
        if (current && customersResponse.customers.some((customer) => customer.customerId === current)) {
          return current
        }

        return customersResponse.customers[0]?.customerId ?? null
      })
      setSelectedSupervisorAgentId((current) => {
        if (current && assignableAgents.some((agent) => agent.agentId === current)) {
          return current
        }

        return assignableAgents[0]?.agentId ?? null
      })
      setSelectedSupervisorAccessAgentId((current) => {
        if (current && fieldAgents.some((agent) => agent.agentId === current)) {
          return current
        }

        return fieldAgents[0]?.agentId ?? null
      })
    } catch (error) {
      if (error instanceof AgentApiError && error.status === 401) {
        await signOut()
        return
      }
      setSupervisorAgents([])
      setSupervisorCustomers([])
      setSupervisorOversight(null)
      setSupervisorAssignments([])
      setSupervisorAuditEntries([])
      setSelectedSupervisorCustomerId(null)
      setIsSupervisorCustomerDetailOpen(false)
      setSelectedSupervisorAgentId(null)
      setSelectedSupervisorAccessAgentId(null)
      setSupervisorError(error instanceof Error ? error.message : 'לא הצלחנו לטעון את נתוני הבקרה של סופרווייזר.')
    } finally {
      setIsSupervisorLoading(false)
    }
  }, [signOut, token])

  const loadSupervisorAssignments = useCallback(
    async (customerId: string) => {
      if (!token) {
        setSupervisorAssignments([])
        setSupervisorError('הסשן חסר. התחברו מחדש כדי להמשיך.')
        return
      }

      try {
        const response = await listSupervisorCustomerAssignments(token, customerId)
        setSupervisorAssignments(response.assignments)
      } catch (error) {
        setSupervisorAssignments([])
        setSupervisorError(error instanceof Error ? error.message : 'לא הצלחנו לטעון שיוכי לקוחות.')
      }
    },
    [token],
  )

  const selectedSupervisorCustomer = useMemo(
    () => supervisorCustomers.find((customer) => customer.customerId === selectedSupervisorCustomerId) ?? null,
    [selectedSupervisorCustomerId, supervisorCustomers],
  )
  const supervisorFieldAgents = useMemo(
    () => supervisorAgents.filter((agent) => agent.role === 'field_agent'),
    [supervisorAgents],
  )
  const assignableSupervisorAgents = useMemo(
    () => supervisorFieldAgents.filter((agent) => agent.isActive),
    [supervisorFieldAgents],
  )
  const selectedSupervisorAccessAgent = useMemo(
    () => supervisorFieldAgents.find((agent) => agent.agentId === selectedSupervisorAccessAgentId) ?? null,
    [selectedSupervisorAccessAgentId, supervisorFieldAgents],
  )

  useEffect(() => {
    setSupervisorProfileDraft(toSupervisorProfileDraft(selectedSupervisorCustomer))
  }, [selectedSupervisorCustomer])

  useEffect(() => {
    if (!selectedSupervisorCustomerId || !isSupervisorRole) {
      setSupervisorAssignments([])
      return
    }

    void loadSupervisorAssignments(selectedSupervisorCustomerId)
  }, [isSupervisorRole, loadSupervisorAssignments, selectedSupervisorCustomerId])

  useEffect(() => {
    if (!isSupervisorRole || activeTab !== 'supervisor') {
      setSupervisorAuditEntries([])
      return
    }

    if (activeSupervisorWorkspaceTab !== 'audit') {
      return
    }

    void loadSupervisorAuditLog(selectedSupervisorCustomerId)
  }, [activeSupervisorWorkspaceTab, activeTab, isSupervisorRole, loadSupervisorAuditLog, selectedSupervisorCustomerId])

  useEffect(() => {
    if (!selectedSupervisorCustomerId || activeSupervisorWorkspaceTab !== 'customers') {
      setIsSupervisorCustomerDetailOpen(false)
    }
  }, [activeSupervisorWorkspaceTab, selectedSupervisorCustomerId])

  const refreshSupervisorWorkspaceData = useCallback(
    async ({
      customerId = selectedSupervisorCustomerId,
      includeAssignments = true,
      includeAudit = activeSupervisorWorkspaceTab === 'audit',
    }: {
      customerId?: string | null
      includeAssignments?: boolean
      includeAudit?: boolean
    } = {}) => {
      await loadSupervisorData()

      if (includeAssignments) {
        if (customerId) {
          await loadSupervisorAssignments(customerId)
        } else {
          setSupervisorAssignments([])
        }
      }

      if (includeAudit) {
        await loadSupervisorAuditLog(customerId ?? null)
      }
    },
    [
      activeSupervisorWorkspaceTab,
      loadSupervisorAssignments,
      loadSupervisorAuditLog,
      loadSupervisorData,
      selectedSupervisorCustomerId,
    ],
  )

  const assignCustomerOwnership = useCallback(async () => {
    if (!token || !selectedSupervisorCustomerId || !selectedSupervisorAgentId) {
      setSupervisorError('יש לבחור לקוח וסוכן פעיל כדי לבצע שיוך.')
      return
    }

    setIsSupervisorMutating(true)
    setSupervisorError(null)
    setSupervisorInfo(null)

    try {
      const result = await assignSupervisorCustomer(token, selectedSupervisorCustomerId, selectedSupervisorAgentId)
      setSupervisorInfo(result.created ? 'שיוך הלקוח נשמר בהצלחה.' : 'הלקוח כבר משויך לסוכן זה.')
      await refreshSupervisorWorkspaceData({ customerId: selectedSupervisorCustomerId })
    } catch (error) {
      setSupervisorError(error instanceof Error ? error.message : 'לא הצלחנו לשייך את הלקוח לסוכן.')
    } finally {
      setIsSupervisorMutating(false)
    }
  }, [
    refreshSupervisorWorkspaceData,
    selectedSupervisorAgentId,
    selectedSupervisorCustomerId,
    token,
  ])

  const unassignCustomerOwnership = useCallback(
    async (customerId: string, agentId: string) => {
      const normalizedCustomerId = customerId.trim()
      if (!token || !normalizedCustomerId) {
        setSupervisorError('יש לבחור לקוח לפני הסרת שיוך.')
        return
      }

      setIsSupervisorMutating(true)
      setSupervisorError(null)
      setSupervisorInfo(null)

      try {
        const result = await unassignSupervisorCustomer(token, normalizedCustomerId, agentId)
        setSupervisorInfo(result.removed ? 'שיוך הוסר בהצלחה.' : 'לא נמצא שיוך להסרה עבור הסוכן שנבחר.')
        await refreshSupervisorWorkspaceData({ customerId: normalizedCustomerId })
      } catch (error) {
        setSupervisorError(error instanceof Error ? error.message : 'לא הצלחנו להסיר את השיוך.')
      } finally {
        setIsSupervisorMutating(false)
      }
    },
    [refreshSupervisorWorkspaceData, token],
  )

  const toggleSupervisorAgentAccess = useCallback(async () => {
    if (!token || !selectedSupervisorAccessAgent) {
      setSupervisorError('יש לבחור סוכן כדי לעדכן את הגישה שלו.')
      return
    }

    const nextIsActive = !selectedSupervisorAccessAgent.isActive
    setIsSupervisorMutating(true)
    setSupervisorError(null)
    setSupervisorInfo(null)

    try {
      const updated = await updateSupervisorAgentAccess(token, selectedSupervisorAccessAgent.agentId, {
        isActive: nextIsActive,
        reason: nextIsActive ? 'הפעלה מחדש מהאפליקציה' : 'השעיה מהאפליקציה',
      })

      setSupervisorAgents((current) =>
        current.map((agent) => (agent.agentId === updated.agent.agentId ? updated.agent : agent)),
      )

      if (!nextIsActive && selectedSupervisorAgentId === selectedSupervisorAccessAgent.agentId) {
        setSelectedSupervisorAgentId((current) => {
          if (current !== selectedSupervisorAccessAgent.agentId) {
            return current
          }

          return (
            supervisorFieldAgents.find(
              (agent) => agent.isActive && agent.agentId !== selectedSupervisorAccessAgent.agentId,
            )?.agentId ?? null
          )
        })
      }

      setSupervisorInfo(nextIsActive ? 'גישת הסוכן הופעלה מחדש.' : 'גישת הסוכן הושבתה בהצלחה.')
      await refreshSupervisorWorkspaceData({ includeAssignments: false })
    } catch (error) {
      setSupervisorError(error instanceof Error ? error.message : 'לא הצלחנו לעדכן את גישת הסוכן.')
    } finally {
      setIsSupervisorMutating(false)
    }
  }, [
    refreshSupervisorWorkspaceData,
    selectedSupervisorAccessAgent,
    selectedSupervisorAgentId,
    supervisorFieldAgents,
    token,
  ])

  const forceLogoutSelectedSupervisorAgent = useCallback(async () => {
    if (!token || !selectedSupervisorAccessAgent) {
      setSupervisorError('יש לבחור סוכן לפני ניתוק הסשנים הפעילים שלו.')
      return
    }

    setIsSupervisorMutating(true)
    setSupervisorError(null)
    setSupervisorInfo(null)

    try {
      await forceLogoutSupervisorAgent(token, selectedSupervisorAccessAgent.agentId, {
        reason: 'ניתוק יזום ממסך הסופרווייזר',
      })
      setSupervisorInfo(`הסשנים הפעילים של ${selectedSupervisorAccessAgent.name} נותקו.`)
      await refreshSupervisorWorkspaceData({ includeAssignments: false })
    } catch (error) {
      setSupervisorError(error instanceof Error ? error.message : 'לא הצלחנו לנתק את הסשנים הפעילים.')
    } finally {
      setIsSupervisorMutating(false)
    }
  }, [refreshSupervisorWorkspaceData, selectedSupervisorAccessAgent, token])

  const createSupervisorManagedAgent = useCallback(async () => {
    if (!token) {
      setSupervisorError('הסשן חסר. התחברו מחדש כדי להמשיך.')
      return
    }

    const normalizedName = supervisorCreateAgentDraft.name.trim()
    const normalizedPhone = supervisorCreateAgentDraft.phone.trim()
    const normalizedPassword = supervisorCreateAgentDraft.password.trim()
    const normalizedEmail = supervisorCreateAgentDraft.email.trim()

    if (!normalizedName || !normalizedPhone || !normalizedPassword) {
      setSupervisorError('שם, טלפון וסיסמה הם שדות חובה ליצירת סוכן.')
      return
    }

    setIsSupervisorMutating(true)
    setSupervisorError(null)
    setSupervisorInfo(null)

    try {
      const result = await createSupervisorAgent(token, {
        name: normalizedName,
        phone: normalizedPhone,
        email: normalizedEmail.length > 0 ? normalizedEmail : null,
        password: normalizedPassword,
        role: supervisorCreateAgentDraft.role,
      })

      setSupervisorInfo(`נוצר סוכן חדש: ${result.agent.name}.`)
      setSupervisorCreateAgentDraft((current) => ({
        ...current,
        name: '',
        phone: '',
        email: '',
        password: '',
      }))

      await refreshSupervisorWorkspaceData({ includeAssignments: false })
    } catch (error) {
      setSupervisorError(error instanceof Error ? error.message : 'לא הצלחנו ליצור סוכן חדש.')
    } finally {
      setIsSupervisorMutating(false)
    }
  }, [refreshSupervisorWorkspaceData, supervisorCreateAgentDraft, token])

  const saveSupervisorCustomerProfile = useCallback(async () => {
    if (!token || !selectedSupervisorCustomerId) {
      setSupervisorError('יש לבחור לקוח לפני שמירת פרופיל.')
      return
    }

    const normalizedName = supervisorProfileDraft.name.trim()
    if (!normalizedName) {
      setSupervisorError('שם הלקוח הוא שדה חובה.')
      return
    }

    const toNullable = (value: string): string | null => {
      const normalized = value.trim()
      return normalized.length > 0 ? normalized : null
    }

    setIsSupervisorMutating(true)
    setSupervisorError(null)
    setSupervisorInfo(null)

    try {
      const updated = await updateSupervisorCustomerProfile(token, selectedSupervisorCustomerId, {
        name: normalizedName,
        contactName: toNullable(supervisorProfileDraft.contactName),
        phone: toNullable(supervisorProfileDraft.phone),
        city: toNullable(supervisorProfileDraft.city),
        notes: toNullable(supervisorProfileDraft.notes),
        status: supervisorProfileDraft.status,
      })

      setSupervisorCustomers((current) =>
        current.map((customer) =>
          customer.customerId === updated.customerId
            ? {
                ...customer,
                name: updated.name,
                contactName: updated.contactName,
                phone: updated.phone,
                city: updated.city,
                notes: updated.notes,
                status: updated.status,
                updatedAt: updated.updatedAt,
              }
            : customer,
        ),
      )
      setSupervisorProfileDraft(
        toSupervisorProfileDraft({
          customerId: updated.customerId,
          name: updated.name,
          contactName: updated.contactName,
          phone: updated.phone,
          city: updated.city,
          notes: updated.notes,
          status: updated.status,
          updatedAt: updated.updatedAt,
          assignment: selectedSupervisorCustomer?.assignment ?? {
            assignmentCount: 0,
            assignedAgentIds: [],
            lastAssignedAt: null,
          },
        }),
      )
      setSupervisorInfo('פרטי הלקוח עודכנו בהצלחה.')
      await refreshSupervisorWorkspaceData({ customerId: selectedSupervisorCustomerId })
    } catch (error) {
      setSupervisorError(error instanceof Error ? error.message : 'לא הצלחנו לשמור את פרופיל הלקוח.')
    } finally {
      setIsSupervisorMutating(false)
    }
  }, [refreshSupervisorWorkspaceData, selectedSupervisorCustomer, selectedSupervisorCustomerId, supervisorProfileDraft, token])

  useEffect(() => {
    if (activeTab === 'supervisor') {
      if (isSupervisorRole) {
        void loadSupervisorData()
      }
      return
    }

    if (isSupervisorRole) {
      return
    }

    if (activeTab === 'orders') {
      const nextOrdersFilterSignature = `${activeOrderDateFilter}|${ordersSearchQuery.trim()}`
      const didOrdersFilterChange = latestOrdersFilterSignatureRef.current !== nextOrdersFilterSignature
      if (didOrdersFilterChange) {
        latestOrdersFilterSignatureRef.current = nextOrdersFilterSignature
        if (ordersPage !== 1) {
          setOrdersPage(1)
          return
        }
      }
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
  }, [
    activeOrderDateFilter,
    activeTab,
    isSupervisorRole,
    loadCustomers,
    loadHomeOrdersSnapshot,
    loadOrders,
    loadSupervisorData,
    ordersPage,
    ordersSearchQuery,
  ])

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
  const normalizedSupervisorSearchQuery = supervisorCustomerSearchQuery.trim().toLowerCase()
  const filteredSupervisorCustomers = useMemo(() => {
    if (!normalizedSupervisorSearchQuery) {
      return supervisorCustomers
    }

    return supervisorCustomers.filter((customer) => {
      const searchable = [customer.customerId, customer.name, customer.contactName ?? '', customer.phone ?? '', customer.city ?? '']
        .join(' ')
        .toLowerCase()
      return searchable.includes(normalizedSupervisorSearchQuery)
    })
  }, [normalizedSupervisorSearchQuery, supervisorCustomers])

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
  const openSupervisorCustomerDetail = useCallback((customerId: string) => {
    setSelectedSupervisorCustomerId(customerId)
    setIsSupervisorCustomerDetailOpen(true)
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

  const renderSupervisorCustomersList = (): React.JSX.Element => {
    if (filteredSupervisorCustomers.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.mutedText}>
            {supervisorCustomers.length === 0 ? 'אין לקוחות זמינים לניהול כרגע.' : 'לא נמצאו לקוחות שמתאימים לחיפוש.'}
          </Text>
        </View>
      )
    }

    return (
      <View style={styles.customerListSection}>
        <View style={styles.customerGrid}>
          {filteredSupervisorCustomers.map((customer) => {
            const status = getSupervisorCustomerStatus(customer)
            const subtitleParts = [customer.city, customer.phone].filter((value): value is string => Boolean(value && value.trim()))
            return (
              <Pressable
                accessibilityRole="button"
                key={customer.customerId}
                onPress={() => {
                  openSupervisorCustomerDetail(customer.customerId)
                }}
                style={({ pressed }) => [
                  styles.customerCard,
                  status.tone === 'success' ? styles.customerCardPrimaryBorder : styles.customerCardSecondaryBorder,
                  pressed && styles.customerCardPressed,
                ]}
              >
                <View style={styles.customerCardHeader}>
                  <View style={styles.statusRow}>
                    <View style={[styles.statusDot, status.tone === 'success' ? styles.statusDotSuccess : styles.statusDotWarning]} />
                    <Text style={styles.statusText}>{status.label}</Text>
                  </View>
                  <Text style={styles.customerCode}>
                    {renderHebrewNumericRuns(`${customer.assignment.assignmentCount} שיוכים`)}
                  </Text>
                </View>
                <Text style={styles.customerId}>{customer.name}</Text>
                <Text style={styles.customerMeta}>
                  {subtitleParts.length > 0
                    ? subtitleParts.join(' · ')
                    : renderHebrewNumericRuns(`עודכן: ${formatSupervisorAuditTime(customer.updatedAt)}`)}
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
                      <Text style={styles.orderPreviewMetricLabel}>מחיר לק״ג:</Text>
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
                              {renderHebrewNumericRuns(`${formatCurrency(item.unitPrice, 'ILS')} / ק״ג`)}
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
                        `${formatCurrency(line.quantity > 0 ? line.lineTotal / line.quantity : line.lineTotal, selectedOrder.currency)} לק״ג`,
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

  const renderSupervisorTab = (): React.JSX.Element => {
    const customerSelectionRequired = !selectedSupervisorCustomerId
    const canAssign = Boolean(selectedSupervisorCustomerId && selectedSupervisorAgentId)
    const canToggleAccess = Boolean(selectedSupervisorAccessAgent)
    const agentNameById = new Map(supervisorAgents.map((agent) => [agent.agentId, agent.name]))
    const oversightByAgent = supervisorOversight?.orders.byAgent ?? []
    const oversightByCustomer = supervisorOversight?.orders.byCustomer ?? []
    const oversightErpSignals = supervisorOversight?.erp.recentSignals ?? []
    const selectedCustomerLabel = selectedSupervisorCustomer?.name ?? 'לא נבחר לקוח'

    return (
      <View style={styles.tabSection} testID={AGENT_SCREEN_TEST_IDS.supervisorControlPlane}>
        <View style={styles.supervisorControlHeaderCard}>
          <View style={styles.supervisorControlHeading}>
            <View style={styles.supervisorControlIconWrap}>
              <MaterialIcons color={palette.primaryContainer} name="admin-panel-settings" size={20} />
            </View>
            <View style={styles.supervisorControlHeadingText}>
              <Text style={styles.supervisorControlTitle}>מרכז בקרה</Text>
              <Text style={styles.supervisorControlMeta}>
                {renderHebrewNumericRuns(`${supervisorCustomers.length} לקוחות · ${supervisorAgents.length} סוכנים`)}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void refreshSupervisorWorkspaceData()
            }}
            style={({ pressed }) => [styles.supervisorRefreshButton, pressed && styles.tabButtonPressed]}
          >
            <MaterialIcons color={palette.secondary} name="refresh" size={16} />
            <Text style={styles.supervisorRefreshButtonText}>רענון</Text>
          </Pressable>
        </View>

        {renderBanner(getResilienceHint(false, supervisorError), Boolean(supervisorError))}
        {supervisorInfo ? <Text style={styles.noticeBanner}>{supervisorInfo}</Text> : null}

        {isSupervisorLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator />
            <Text style={styles.mutedText}>טוענים נתוני בקרה…</Text>
          </View>
        ) : (
          <>
            <View style={styles.supervisorWorkspaceTabsContainer}>
              <View style={styles.supervisorWorkspaceTabsContent}>
                {SUPERVISOR_WORKSPACE_TABS.map((workspaceTab) => {
                  const isActive = workspaceTab.id === activeSupervisorWorkspaceTab
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={workspaceTab.id}
                      onPress={() => {
                        setActiveSupervisorWorkspaceTab(workspaceTab.id)
                        if (workspaceTab.id !== 'customers') {
                          setIsSupervisorCustomerDetailOpen(false)
                        }
                      }}
                      style={({ pressed }) => [
                        styles.supervisorWorkspaceTab,
                        isActive && styles.supervisorWorkspaceTabActive,
                        pressed && styles.tabButtonPressed,
                      ]}
                    >
                      <MaterialIcons color={isActive ? '#fff' : palette.secondary} name={workspaceTab.icon} size={16} />
                      <Text style={[styles.supervisorWorkspaceTabLabel, isActive && styles.supervisorWorkspaceTabLabelActive]}>
                        {workspaceTab.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            {activeSupervisorWorkspaceTab === 'overview' ? (
              <View style={styles.panelSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.panelTitle}>דשבורד תפעולי יומי</Text>
                <Text style={styles.sectionMeta}>
                  {supervisorOversight
                    ? renderHebrewNumericRuns(`עודכן ${formatSupervisorAuditTime(supervisorOversight.generatedAt)}`)
                    : 'ללא נתוני דשבורד'}
                </Text>
              </View>

              {supervisorOversight ? (
                <>
                  <View style={styles.supervisorOversightMetricsGrid}>
                    <View style={styles.supervisorOversightMetricCard}>
                      <Text style={styles.supervisorOversightMetricLabel}>הזמנות היום</Text>
                      <Text style={styles.supervisorOversightMetricValue}>
                        {renderHebrewNumericRuns(String(supervisorOversight.orders.totalOrders))}
                      </Text>
                    </View>
                    <View style={styles.supervisorOversightMetricCard}>
                      <Text style={styles.supervisorOversightMetricLabel}>ממתינות לניסיון חוזר</Text>
                      <Text style={styles.supervisorOversightMetricValue}>
                        {renderHebrewNumericRuns(String(supervisorOversight.orders.pendingRetryCount))}
                      </Text>
                    </View>
                    <View style={styles.supervisorOversightMetricCard}>
                      <Text style={styles.supervisorOversightMetricLabel}>כשלי ERP</Text>
                      <Text style={styles.supervisorOversightMetricValue}>
                        {renderHebrewNumericRuns(String(supervisorOversight.orders.failedCount))}
                      </Text>
                    </View>
                    <View style={styles.supervisorOversightMetricCard}>
                      <Text style={styles.supervisorOversightMetricLabel}>לקוחות ללא שיוך</Text>
                      <Text style={styles.supervisorOversightMetricValue}>
                        {renderHebrewNumericRuns(String(supervisorOversight.unassignedCustomers.total))}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.supervisorOversightColumns}>
                    <View style={styles.supervisorOversightColumn}>
                      <Text style={styles.supervisorBulkLabel}>הזמנות לפי סוכן</Text>
                      {oversightByAgent.length === 0 ? (
                        <Text style={styles.mutedText}>אין הזמנות בסלוט היומי.</Text>
                      ) : (
                        <View style={styles.supervisorOversightList}>
                          {oversightByAgent.slice(0, 5).map((entry) => (
                            <View
                              key={entry.agentId ?? 'unassigned-agent'}
                              style={styles.supervisorOversightRow}
                            >
                              <Text style={styles.supervisorOversightRowPrimary}>{entry.agentName}</Text>
                              <Text style={styles.supervisorOversightRowMeta}>
                                {renderHebrewNumericRuns(
                                  `${entry.orderCount} הזמנות · ${formatCurrency(entry.totalAmount, 'ILS')}`,
                                )}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>

                    <View style={styles.supervisorOversightColumn}>
                      <Text style={styles.supervisorBulkLabel}>הזמנות לפי לקוח</Text>
                      {oversightByCustomer.length === 0 ? (
                        <Text style={styles.mutedText}>אין הזמנות בסלוט היומי.</Text>
                      ) : (
                        <View style={styles.supervisorOversightList}>
                          {oversightByCustomer.slice(0, 5).map((entry) => (
                            <View key={entry.customerId} style={styles.supervisorOversightRow}>
                              <Text style={styles.supervisorOversightRowPrimary}>{entry.customerName}</Text>
                              <Text style={styles.supervisorOversightRowMeta}>
                                {renderHebrewNumericRuns(
                                  `${entry.orderCount} הזמנות · ${formatCurrency(entry.totalAmount, 'ILS')}`,
                                )}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.supervisorOversightColumn}>
                    <Text style={styles.supervisorBulkLabel}>משפך הפעלה והמרה</Text>
                    <Text style={styles.supervisorOversightRowMeta}>
                      {renderHebrewNumericRuns(
                        `קישורים ${supervisorOversight.funnel.magicLinksIssued} · ניסיונות ${supervisorOversight.funnel.activationAttempts} · הפעלות ${supervisorOversight.funnel.sessionsActivated} · הזמנות ${supervisorOversight.funnel.ordersSubmitted}`,
                      )}
                    </Text>
                    <Text style={styles.supervisorOversightRowMeta}>
                      {renderHebrewNumericRuns(
                        `הצלחת הפעלה ${formatSupervisorOversightRate(supervisorOversight.funnel.activationSuccessRate)} · יחס קישור→סשן ${formatSupervisorOversightRate(supervisorOversight.funnel.linkToSessionConversionRate)} · יחס סשן→הזמנה ${formatSupervisorOversightRate(supervisorOversight.funnel.sessionToOrderConversionRate)}`,
                      )}
                    </Text>
                  </View>

                  <View style={styles.supervisorOversightColumn}>
                    <Text style={styles.supervisorBulkLabel}>אותות ERP לטיפול</Text>
                    {oversightErpSignals.length === 0 ? (
                      <Text style={styles.mutedText}>אין כשלים או retries פתוחים להיום.</Text>
                    ) : (
                      <View style={styles.supervisorOversightList}>
                        {oversightErpSignals.slice(0, 4).map((signal) => (
                          <View key={signal.orderId} style={styles.supervisorOversightRow}>
                            <Text style={styles.supervisorOversightRowPrimary}>
                              {renderHebrewNumericRuns(`${signal.customerName} · ${formatSupervisorOrderStatus(signal.status)}`)}
                            </Text>
                            <Text style={styles.supervisorOversightRowMeta}>
                              {renderHebrewNumericRuns(
                                `${formatCurrency(signal.estimatedTotal, 'ILS')} · ${formatSupervisorAuditTime(signal.submittedAt)}`,
                              )}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </>
              ) : (
                <Text style={styles.mutedText}>לא הצלחנו לטעון נתוני דשבורד תפעולי כרגע.</Text>
              )}
              </View>
            ) : null}

            {activeSupervisorWorkspaceTab === 'customers' || activeSupervisorWorkspaceTab === 'agents' ? (
                  <>
                    {activeSupervisorWorkspaceTab === 'customers' ? (
                      <>
                        {!isSupervisorCustomerDetailOpen ? (
                          <View style={styles.panelSection}>
                            <View style={styles.sectionHeader}>
                              <Text style={styles.panelTitle}>בחירת לקוח לניהול</Text>
                              <Text style={styles.sectionMeta}>{renderHebrewNumericRuns(`${filteredSupervisorCustomers.length} לקוחות בתצוגה`)}</Text>
                            </View>
                            {renderSupervisorCustomersList()}
                          </View>
                        ) : (
                          <>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => {
                                setIsSupervisorCustomerDetailOpen(false)
                              }}
                              style={({ pressed }) => [styles.detailBackButton, pressed && styles.primaryButtonDisabled]}
                            >
                              <MaterialIcons color={palette.secondary} name="arrow-forward" size={16} />
                              <Text style={styles.detailBackButtonText}>חזרה לרשימת הלקוחות</Text>
                            </Pressable>
                            <View style={styles.supervisorWorkspaceInfoCard}>
                              <MaterialIcons color={palette.secondary} name="person-pin-circle" size={18} />
                              <Text style={styles.supervisorWorkspaceInfoText}>
                                {renderHebrewNumericRuns(`לקוח נבחר לניהול: ${selectedCustomerLabel}`)}
                              </Text>
                            </View>
                          </>
                        )}
                      </>
                    ) : null}

            {activeSupervisorWorkspaceTab === 'agents' ? (
              <>
                <View style={styles.panelSection}>
              <Text style={styles.panelTitle}>ניהול גישת סוכנים</Text>
              {supervisorFieldAgents.length === 0 ? (
                <Text style={styles.mutedText}>לא נמצאו סוכנים לניהול גישה.</Text>
              ) : (
                <>
                  <ScrollView horizontal contentContainerStyle={styles.customerFilterContent} showsHorizontalScrollIndicator={false}>
                    {supervisorFieldAgents.map((agent) => {
                      const isSelected = agent.agentId === selectedSupervisorAccessAgentId
                      return (
                        <Pressable
                          accessibilityRole="button"
                          key={agent.agentId}
                          onPress={() => {
                            setSelectedSupervisorAccessAgentId(agent.agentId)
                          }}
                          style={({ pressed }) => [
                            styles.filterChip,
                            isSelected ? styles.filterChipSelected : styles.filterChipDefault,
                            pressed && styles.tabButtonPressed,
                          ]}
                        >
                          <Text style={[styles.filterChipText, isSelected ? styles.filterChipTextSelected : styles.filterChipTextDefault]}>
                            {renderHebrewNumericRuns(`${agent.name} · ${agent.isActive ? 'פעיל' : 'מושבת'}`)}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </ScrollView>

                  {selectedSupervisorAccessAgent ? (
                    <Text style={styles.supervisorAgentHint}>
                      {renderHebrewNumericRuns(
                        `סטטוס: ${selectedSupervisorAccessAgent.isActive ? 'פעיל' : 'מושבת'} · ${selectedSupervisorAccessAgent.assignmentCount} לקוחות`,
                      )}
                    </Text>
                  ) : null}

                  <View style={styles.settingsActionRow}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!canToggleAccess || isSupervisorMutating}
                      onPress={() => {
                        void toggleSupervisorAgentAccess()
                      }}
                      style={({ pressed }) => [
                        styles.primaryButtonSmall,
                        selectedSupervisorAccessAgent?.isActive ? styles.supervisorDangerActionButton : null,
                        (!canToggleAccess || isSupervisorMutating || pressed) && styles.primaryButtonDisabled,
                      ]}
                    >
                      <Text
                        style={
                          selectedSupervisorAccessAgent?.isActive
                            ? styles.supervisorDangerActionText
                            : styles.primaryButtonText
                        }
                      >
                        {selectedSupervisorAccessAgent?.isActive ? 'השבתת סוכן' : 'הפעלת סוכן'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!canToggleAccess || isSupervisorMutating}
                      onPress={() => {
                        void forceLogoutSelectedSupervisorAgent()
                      }}
                      style={({ pressed }) => [
                        styles.secondaryButtonSmall,
                        (!canToggleAccess || isSupervisorMutating || pressed) && styles.primaryButtonDisabled,
                      ]}
                    >
                      <Text style={styles.secondaryButtonText}>ניתוק סשנים</Text>
                    </Pressable>
                  </View>
                </>
              )}
                </View>

                <View style={styles.panelSection}>
              <Text style={styles.panelTitle}>יצירת חשבון סוכן חדש</Text>
              <TextInput
                accessibilityLabel="שם סוכן חדש"
                onChangeText={(value) => {
                  setSupervisorCreateAgentDraft((current) => ({ ...current, name: value }))
                }}
                placeholder="שם מלא"
                style={styles.input}
                value={supervisorCreateAgentDraft.name}
              />
              <TextInput
                accessibilityLabel="טלפון סוכן חדש"
                keyboardType="phone-pad"
                onChangeText={(value) => {
                  setSupervisorCreateAgentDraft((current) => ({ ...current, phone: value }))
                }}
                placeholder="טלפון"
                style={styles.input}
                value={supervisorCreateAgentDraft.phone}
              />
              <TextInput
                accessibilityLabel="אימייל סוכן חדש"
                keyboardType="email-address"
                onChangeText={(value) => {
                  setSupervisorCreateAgentDraft((current) => ({ ...current, email: value }))
                }}
                placeholder="אימייל (אופציונלי)"
                style={styles.input}
                value={supervisorCreateAgentDraft.email}
              />
              <TextInput
                accessibilityLabel="סיסמה לסוכן חדש"
                onChangeText={(value) => {
                  setSupervisorCreateAgentDraft((current) => ({ ...current, password: value }))
                }}
                placeholder="סיסמה זמנית"
                secureTextEntry
                style={styles.input}
                value={supervisorCreateAgentDraft.password}
              />

              <View style={styles.supervisorStatusRow}>
                {SUPERVISOR_AGENT_ROLE_OPTIONS.map((option) => {
                  const isSelected = supervisorCreateAgentDraft.role === option.value
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={option.value}
                      onPress={() => {
                        setSupervisorCreateAgentDraft((current) => ({ ...current, role: option.value }))
                      }}
                      style={({ pressed }) => [
                        styles.filterChip,
                        isSelected ? styles.filterChipSelected : styles.filterChipDefault,
                        pressed && styles.tabButtonPressed,
                      ]}
                    >
                      <Text style={[styles.filterChipText, isSelected ? styles.filterChipTextSelected : styles.filterChipTextDefault]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={isSupervisorMutating}
                onPress={() => {
                  void createSupervisorManagedAgent()
                }}
                style={({ pressed }) => [
                  styles.primaryButtonSmallWide,
                  (isSupervisorMutating || pressed) && styles.primaryButtonDisabled,
                ]}
              >
                <Text style={styles.primaryButtonText}>יצירת חשבון סוכן</Text>
              </Pressable>
                </View>
              </>
            ) : null}

            {activeSupervisorWorkspaceTab === 'customers' && isSupervisorCustomerDetailOpen ? (
              <>
            <View style={styles.panelSection}>
              <Text style={styles.panelTitle}>שיוך לקוח לסוכן</Text>
              {assignableSupervisorAgents.length === 0 ? (
                <Text style={styles.mutedText}>אין סוכנים פעילים זמינים לשיוך.</Text>
              ) : (
                <ScrollView horizontal contentContainerStyle={styles.customerFilterContent} showsHorizontalScrollIndicator={false}>
                  {assignableSupervisorAgents.map((agent) => {
                    const isSelected = agent.agentId === selectedSupervisorAgentId
                    return (
                      <Pressable
                        accessibilityRole="button"
                        key={agent.agentId}
                        onPress={() => {
                          setSelectedSupervisorAgentId(agent.agentId)
                        }}
                        style={({ pressed }) => [
                          styles.filterChip,
                          isSelected ? styles.filterChipSelected : styles.filterChipDefault,
                          pressed && styles.tabButtonPressed,
                        ]}
                      >
                        <Text style={[styles.filterChipText, isSelected ? styles.filterChipTextSelected : styles.filterChipTextDefault]}>
                          {agent.name}
                        </Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              )}

              <View style={styles.settingsActionRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={!canAssign || isSupervisorMutating}
                  onPress={() => {
                    void assignCustomerOwnership()
                  }}
                  style={({ pressed }) => [
                    styles.primaryButtonSmallWide,
                    (!canAssign || isSupervisorMutating || pressed) && styles.primaryButtonDisabled,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>שיוך לסוכן נבחר</Text>
                </Pressable>
              </View>

              <View style={styles.supervisorAssignmentList}>
                {customerSelectionRequired ? (
                  <Text style={styles.mutedText}>בחרו לקוח כדי לראות את השיוכים הקיימים.</Text>
                ) : supervisorAssignments.length === 0 ? (
                  <Text style={styles.mutedText}>ללקוח זה אין שיוכים פעילים כרגע.</Text>
                ) : (
                  supervisorAssignments.map((assignment) => (
                    <View key={`${assignment.customerId}-${assignment.agentId}`} style={styles.supervisorAssignmentRow}>
                      <View style={styles.supervisorAssignmentMeta}>
                        <Text style={styles.supervisorAssignmentAgent}>
                          {agentNameById.get(assignment.agentId) ?? assignment.agentId}
                        </Text>
                        <Text style={styles.supervisorAssignmentDate}>
                          {renderHebrewNumericRuns(`שויך ב-${new Date(assignment.assignedAt).toLocaleString('he-IL')}`)}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        disabled={isSupervisorMutating}
                        onPress={() => {
                          void unassignCustomerOwnership(assignment.customerId, assignment.agentId)
                        }}
                        style={({ pressed }) => [styles.linkButtonInline, (isSupervisorMutating || pressed) && styles.linkButtonDisabled]}
                      >
                        <Text style={styles.supervisorUnassignText}>הסר שיוך</Text>
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
            </View>

            <View style={styles.panelSection}>
              <Text style={styles.panelTitle}>עריכת פרופיל לקוח</Text>
              <TextInput
                accessibilityLabel="שם לקוח"
                onChangeText={(value) => {
                  setSupervisorProfileDraft((current) => ({ ...current, name: value }))
                }}
                placeholder="שם לקוח"
                style={styles.input}
                value={supervisorProfileDraft.name}
              />
              <TextInput
                accessibilityLabel="איש קשר"
                onChangeText={(value) => {
                  setSupervisorProfileDraft((current) => ({ ...current, contactName: value }))
                }}
                placeholder="איש קשר"
                style={styles.input}
                value={supervisorProfileDraft.contactName}
              />
              <TextInput
                accessibilityLabel="טלפון"
                keyboardType="phone-pad"
                onChangeText={(value) => {
                  setSupervisorProfileDraft((current) => ({ ...current, phone: value }))
                }}
                placeholder="טלפון"
                style={styles.input}
                value={supervisorProfileDraft.phone}
              />
              <TextInput
                accessibilityLabel="עיר"
                onChangeText={(value) => {
                  setSupervisorProfileDraft((current) => ({ ...current, city: value }))
                }}
                placeholder="עיר"
                style={styles.input}
                value={supervisorProfileDraft.city}
              />
              <TextInput
                accessibilityLabel="הערות לקוח"
                multiline
                numberOfLines={3}
                onChangeText={(value) => {
                  setSupervisorProfileDraft((current) => ({ ...current, notes: value }))
                }}
                placeholder="הערות תפעוליות"
                style={[styles.input, styles.supervisorNotesInput]}
                textAlignVertical="top"
                value={supervisorProfileDraft.notes}
              />

              <View style={styles.supervisorStatusRow}>
                {SUPERVISOR_STATUS_OPTIONS.map((option) => {
                  const isSelected = supervisorProfileDraft.status === option.value
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={option.value}
                      onPress={() => {
                        setSupervisorProfileDraft((current) => ({ ...current, status: option.value }))
                      }}
                      style={({ pressed }) => [
                        styles.filterChip,
                        isSelected ? styles.filterChipSelected : styles.filterChipDefault,
                        pressed && styles.tabButtonPressed,
                      ]}
                    >
                      <Text style={[styles.filterChipText, isSelected ? styles.filterChipTextSelected : styles.filterChipTextDefault]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={isSupervisorMutating || !selectedSupervisorCustomerId}
                onPress={() => {
                  void saveSupervisorCustomerProfile()
                }}
                style={({ pressed }) => [
                  styles.primaryButtonSmallWide,
                  (isSupervisorMutating || !selectedSupervisorCustomerId || pressed) && styles.primaryButtonDisabled,
                ]}
              >
                <Text style={styles.primaryButtonText}>שמירת פרטי לקוח</Text>
              </Pressable>
            </View>
                  </>
                ) : null}

              </>
            ) : null}

            {activeSupervisorWorkspaceTab === 'audit' ? (
              <View style={styles.panelSection}>
              <Text style={styles.panelTitle}>יומן פעולות אחרונות</Text>
              {isSupervisorAuditLoading ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator />
                  <Text style={styles.mutedText}>טוענים יומן פעולות…</Text>
                </View>
              ) : supervisorAuditEntries.length === 0 ? (
                <Text style={styles.mutedText}>לא נמצאו פעולות חריגות להצגה.</Text>
              ) : (
                <View style={styles.supervisorAuditList}>
                  {supervisorAuditEntries.map((entry) => (
                    <View key={entry.id} style={styles.supervisorAuditRow}>
                      <Text style={styles.supervisorAuditEvent}>{formatSupervisorAuditEvent(entry.eventType)}</Text>
                      <Text style={styles.supervisorAuditMeta}>
                        {renderHebrewNumericRuns(`${entry.actorId} · ${formatSupervisorAuditTime(entry.createdAt)}`)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              </View>
            ) : null}
          </>
        )}
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
            <Text style={styles.settingsAvatarInitials}>{profileDisplayName.slice(0, 2)}</Text>
          </View>
        </ImageBackground>
        <View style={styles.settingsProfileMeta}>
          <Text style={styles.settingsProfileName}>{profileDisplayName}</Text>
          <Text style={styles.settingsProfileSub}>{isSupervisorRole ? 'סופרווייזר מערכת' : 'סוכן מכירות אזורי'}</Text>
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

  const connectionWarning = supervisorError ?? customersError ?? approvedItemsError ?? ordersError ?? homeOrdersError
  const profileDisplayName = profile?.name ?? 'פרופיל לא זמין'

  const refreshActiveTab = useCallback(() => {
    if (activeTab === 'supervisor') {
      void refreshSupervisorWorkspaceData()
      return
    }

    if (activeTab === 'orders') {
      void loadOrders()
      return
    }
    if (activeTab === 'home') {
      void loadHomeOrdersSnapshot()
      return
    }

    if (isSupervisorRole) {
      void refreshSupervisorWorkspaceData()
      return
    }

    void loadCustomers()
  }, [
    activeTab,
    isSupervisorRole,
    loadCustomers,
    loadHomeOrdersSnapshot,
    loadOrders,
    refreshSupervisorWorkspaceData,
  ])

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
          {(activeTab === 'customers' && !isCustomerDetailOpen) ||
          (activeTab === 'orders' && !selectedOrder) ||
          (activeTab === 'supervisor' && activeSupervisorWorkspaceTab === 'customers' && !isSupervisorCustomerDetailOpen) ? (
            <View style={styles.searchBlock}>
              <MaterialIcons color={palette.secondary} name="search" size={18} style={styles.searchIcon} />
              <TextInput
                accessibilityLabel="חיפוש לקוחות"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={
                  activeTab === 'orders'
                    ? 'חיפוש לפי לקוח, קוד פריט או שם פריט...'
                    : activeTab === 'supervisor'
                      ? 'חיפוש לקוח לניהול...'
                      : 'חיפוש לקוח...'
                }
                value={
                  activeTab === 'orders'
                    ? ordersSearchQuery
                    : activeTab === 'supervisor'
                      ? supervisorCustomerSearchQuery
                      : customerSearchQuery
                }
                onChangeText={(value) => {
                  if (activeTab === 'orders') {
                    setOrdersSearchQuery(value)
                    return
                  }
                  if (activeTab === 'supervisor') {
                    setSupervisorCustomerSearchQuery(value)
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
          {activeTab === 'supervisor' ? renderSupervisorTab() : null}
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
        {tabItems.map((tab) => {
          const isActive = tab.id === activeTab

          return (
            <Pressable
              accessibilityRole="button"
              key={tab.id}
              onPress={() => {
                setIsCustomerDetailOpen(false)
                setIsSupervisorCustomerDetailOpen(false)
                setSelectedOrderId(null)
                setCustomerSearchQuery('')
                setSupervisorCustomerSearchQuery('')
                setActiveCustomerFilter('all')
                setOrdersSearchQuery('')
                setActiveOrderDateFilter('all')
                setOrdersPage(1)
                setCatalogPage(1)
                setMonthlyGoalDraft(String(monthlyGoalAmount))
                setMonthlyGoalError(null)
                setSupervisorError(null)
                setSupervisorInfo(null)
                if (tab.id !== 'supervisor') {
                  setSupervisorAssignments([])
                }
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

const baseStyles = StyleSheet.create({
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

const styles = {
  ...baseStyles,
  ...createSupervisorStyles({
    isRtlLayout: IS_RTL_LAYOUT,
    numericFontFamily: NUMERIC_FONT_FAMILY,
    scaledFont,
  }),
}
