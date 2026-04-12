import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import type { AgentApprovedItem, AgentAssignedCustomer, AgentMagicLinkIssueResponse } from '@meatland/shared-types'

import { addApprovedItem, generateMagicLink, listApprovedItems, listAssignedCustomers } from '../api/agent-customers-client'
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
} from './agent-dashboard-presenter'

const SLOW_NETWORK_THRESHOLD_MS = 1800

const TAB_ITEMS: Array<{ id: AgentDashboardTabId; label: string; icon: string }> = [
  { id: 'home', label: 'בית', icon: '⌂' },
  { id: 'customers', label: 'לקוחות', icon: '◉' },
  { id: 'catalog', label: 'קטלוג', icon: '≡' },
  { id: 'settings', label: 'הגדרות', icon: '⚙' },
]

type CustomerFilterId = 'all' | 'active' | 'needs_action' | 'pending_link'

const CUSTOMER_FILTERS: Array<{ id: CustomerFilterId; label: string }> = [
  { id: 'all', label: 'הכל' },
  { id: 'active', label: 'פעיל' },
  { id: 'needs_action', label: 'דורש פעולה' },
  { id: 'pending_link', label: 'ממתין ללינק' },
]

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

export function AuthenticatedHomeScreen(): React.JSX.Element {
  const { signOut, profile, token } = useAuth()
  const [activeTab, setActiveTab] = useState<AgentDashboardTabId>('home')
  const [searchQuery, setSearchQuery] = useState('')
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
  const rootOpacity = useRef(new Animated.Value(0)).current
  const headerTranslateY = useRef(new Animated.Value(10)).current
  const contentOpacity = useRef(new Animated.Value(0)).current
  const contentTranslateY = useRef(new Animated.Value(18)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(rootOpacity, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(headerTranslateY, {
        toValue: 0,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 420,
        delay: 60,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateY, {
        toValue: 0,
        duration: 420,
        delay: 60,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
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
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
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

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.customerId === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  )

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
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
      ? customers.filter((customer) => customer.customerId.toLowerCase().includes(normalizedSearchQuery))
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

  const openCustomerCatalog = useCallback((customerId: string) => {
    setSelectedCustomerId(customerId)
    setIsCustomerDetailOpen(false)
    setActiveTab('catalog')
  }, [])

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
            לקוח {latestMagicLinkCustomerId} · פג תוקף {formatMagicLinkExpiry(latestMagicLink.expiresAt)} · {latestMagicLink.lifecycle}
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
              openCustomerCatalog(customerId)
            }}
            style={({ pressed }) => [styles.secondaryButtonSmall, pressed && styles.primaryButtonDisabled]}
          >
            <Text style={styles.secondaryButtonText}>קטלוג</Text>
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
                  <Text style={styles.customerCode}>#{customer.customerId}</Text>
                </View>

                <Text style={styles.customerId}>{customer.customerId}</Text>
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
                      <Text style={styles.iconSecondary}>{isExpanded ? '⌃' : '⌄'}</Text>
                    </Pressable>

                    {isExpanded ? (
                      <View style={styles.customerExpandedSection}>
                        <View style={styles.customerDetailGrid}>
                          <View style={styles.customerDetailCell}>
                            <Text style={styles.customerDetailLabel}>מזהה לקוח</Text>
                            <Text style={styles.customerDetailValue}>{customer.customerId}</Text>
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
    <View style={styles.tabSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>תור פעולות דחופות</Text>
        <Text style={styles.sectionMeta}>{priorityQueueCustomers.length} לקוחות ממתינים לקישור</Text>
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
              <Text style={styles.queueCardTitle}>{customer.customerId}</Text>
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
          <Text style={styles.iconSecondary}>◷</Text>
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
      <View style={styles.tabSection}>
        <View style={styles.sectionHeader}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setIsCustomerDetailOpen(false)
            }}
            style={({ pressed }) => [styles.backButton, pressed && styles.linkButtonDisabled]}
          >
            <Text style={styles.iconPrimary}>←</Text>
            <Text style={styles.linkButtonText}>חזרה לרשימה</Text>
          </Pressable>
          <Text style={styles.sectionMeta}>מסך לקוח</Text>
        </View>

        <View style={styles.detailCard}>
          <View style={styles.customerCardHeader}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, status.tone === 'success' ? styles.statusDotSuccess : styles.statusDotWarning]} />
              <Text style={styles.statusText}>{status.label}</Text>
            </View>
            <Text style={styles.customerCode}>#{selectedCustomer.customerId}</Text>
          </View>
          <Text style={styles.detailTitle}>{selectedCustomer.customerId}</Text>
          <Text style={styles.customerMeta}>{formatLastOrderLabel(selectedCustomer.lastOrderAt)}</Text>
          <Text style={styles.customerMeta}>סה״כ פריטים מאושרים: {selectedCustomer.approvedItemsCount}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              openCustomerCatalog(selectedCustomer.customerId)
            }}
            style={({ pressed }) => [styles.secondaryButtonLarge, pressed && styles.primaryButtonDisabled]}
          >
            <Text style={styles.secondaryButtonText}>מעבר לקטלוג המאושר</Text>
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
                <View key={`${item.hashItemId}-${item.createdAt}`} style={styles.approvedRow}>
                  <Text style={styles.approvedTitle}>{item.hashItemId}</Text>
                  <Text style={styles.approvedMeta}>נוסף על ידי {item.addedByAgentId}</Text>
                  <Text style={styles.approvedMeta}>{formatApprovedItemTimestamp(item.createdAt)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    )
  }

  const renderCustomersTab = (): React.JSX.Element => (
    <View style={styles.tabSection}>
      {renderBanner(getResilienceHint(isCustomersSlow, customersError), Boolean(customersError))}
      {isCustomerDetailOpen ? renderCustomerDetail() : renderCustomersList()}
    </View>
  )

  const renderCatalogTab = (): React.JSX.Element => (
    <View style={styles.tabSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>קטלוג מאושר</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setActiveTab('customers')
            setIsCustomerDetailOpen(false)
          }}
          style={({ pressed }) => [styles.linkButtonInline, pressed && styles.linkButtonDisabled]}
        >
          <Text style={styles.linkButtonText}>בחירת לקוח</Text>
        </Pressable>
      </View>

      {!selectedCustomer ? (
        <View style={styles.emptyState}>
          <Text style={styles.mutedText}>אין לקוח פעיל כרגע. עברו ללשונית לקוחות ובחרו לקוח כדי לנהל את הקטלוג המאושר.</Text>
        </View>
      ) : (
        <>
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>{selectedCustomer.customerId}</Text>
            <Text style={styles.customerMeta}>{formatLastOrderLabel(selectedCustomer.lastOrderAt)}</Text>
            <Text style={styles.customerMeta}>פריטים מאושרים: {selectedCustomer.approvedItemsCount}</Text>
          </View>
          <View style={styles.panelSection}>
            <Text style={styles.panelTitle}>פריטים מאושרים</Text>
            {renderBanner(getResilienceHint(isApprovedItemsSlow, approvedItemsError), Boolean(approvedItemsError))}
            {isApprovedItemsLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator />
                <Text style={styles.mutedText}>טוענים פריטים מאושרים…</Text>
              </View>
            ) : approvedItems.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.mutedText}>אין עדיין פריטים מאושרים עבור לקוח זה.</Text>
              </View>
            ) : (
              <View style={styles.approvedList}>
                {approvedItems.map((item) => (
                  <View key={`${item.hashItemId}-${item.createdAt}`} style={styles.approvedRow}>
                    <Text style={styles.approvedTitle}>{item.hashItemId}</Text>
                    <Text style={styles.approvedMeta}>נוסף על ידי {item.addedByAgentId}</Text>
                    <Text style={styles.approvedMeta}>{formatApprovedItemTimestamp(item.createdAt)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <View style={styles.panelSection}>
            <Text style={styles.panelTitle}>הוספת פריט מאושר</Text>
            <TextInput
              accessibilityLabel="Approved item ID"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isAddingItem}
              placeholder="מזהה פריט (לדוגמה itm-123)"
              value={newItemId}
              onChangeText={(value) => {
                setNewItemId(value)
                if (addError) {
                  setAddError(null)
                }
                if (addInfoMessage) {
                  setAddInfoMessage(null)
                }
              }}
              style={styles.input}
            />
            {renderBanner(getResilienceHint(isAddSlow, addError), Boolean(addError))}
            {addInfoMessage ? <Text style={styles.noticeText}>{addInfoMessage}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={isAddingItem || !newItemId.trim()}
              onPress={() => {
                void submitApprovedItem()
              }}
              style={({ pressed }) => [styles.primaryButton, (pressed || isAddingItem || !newItemId.trim()) && styles.primaryButtonDisabled]}
            >
              {isAddingItem ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>הוספת פריט</Text>}
            </Pressable>
          </View>
        </>
      )}
    </View>
  )

  const renderSettingsTab = (): React.JSX.Element => (
    <View style={styles.tabSection}>
      <View style={styles.panelSection}>
        <Text style={styles.panelTitle}>פרופיל נציג</Text>
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
        <Text style={styles.panelTitle}>מצב סנכרון</Text>
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
          <Text style={styles.dangerButtonText}>התנתקות</Text>
        </Pressable>
      </View>
    </View>
  )

  return (
    <Animated.View style={[styles.container, { opacity: rootOpacity }]}>
      <Animated.View style={[styles.topBar, { transform: [{ translateY: headerTranslateY }] }]}>
        <View style={styles.topBarIdentity}>
          <Text style={styles.brandEyebrow}>The Artisanal Ledger</Text>
          <Text style={styles.title}>לוח הסוכן</Text>
          <Text style={styles.subtitle}>{profile ? `מחובר/ת: ${profile.name}` : 'מחובר/ת למשמרת השטח'}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void loadCustomers()
          }}
          style={({ pressed }) => [styles.refreshButton, (pressed || isCustomersLoading) && styles.linkButtonDisabled]}
        >
          <Text style={styles.iconPrimary}>↻</Text>
        </Pressable>
      </Animated.View>

      <View style={styles.searchBlock}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          accessibilityLabel="Search customers"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="חיפוש לפי שם לקוח או מזהה..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
        />
      </View>

      <Animated.View style={[styles.contentLayer, { opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] }]}>
        <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentScrollContainer} showsVerticalScrollIndicator={false}>
          {activeTab === 'home' ? renderDashboardTab() : null}
          {activeTab === 'customers' ? renderCustomersTab() : null}
          {activeTab === 'catalog' ? renderCatalogTab() : null}
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
              <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>{tab.icon}</Text>
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
  topBar: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.outline,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 4,
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  topBarIdentity: {
    flex: 1,
  },
  brandEyebrow: {
    color: palette.primaryContainer,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 3,
    fontWeight: '700',
  },
  title: {
    fontSize: 30,
    color: palette.primaryContainer,
    fontWeight: '800',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  subtitle: {
    marginTop: 2,
    color: palette.textMuted,
    fontSize: 13,
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
  approvedRow: {
    borderRadius: radius.md,
    backgroundColor: palette.surfaceLow,
    borderWidth: 1,
    borderColor: palette.outline,
    padding: spacing.md,
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
