import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
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
  applyApprovedCountMutation,
  buildMagicLinkShareMessage,
  buildWhatsAppDeepLink,
  formatMagicLinkExpiry,
  formatApprovedItemTimestamp,
  formatLastOrderLabel,
  getResilienceHint,
  mergeApprovedItems,
  normalizeMagicLinkForShare,
  shouldUseCopyLinkFallback,
} from './agent-dashboard-presenter'

const SLOW_NETWORK_THRESHOLD_MS = 1800

export function AuthenticatedHomeScreen(): React.JSX.Element {
  const { signOut, profile, token } = useAuth()
  const [customers, setCustomers] = useState<AgentAssignedCustomer[]>([])
  const [isCustomersLoading, setIsCustomersLoading] = useState(true)
  const [customersError, setCustomersError] = useState<string | null>(null)
  const [isCustomersSlow, setIsCustomersSlow] = useState(false)

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
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
  const [pendingCopyLink, setPendingCopyLink] = useState<string | null>(null)

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
      setCustomersError('Your session is missing. Sign in again to continue.')
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
    } catch (error) {
      setCustomersError(error instanceof Error ? error.message : 'Unable to load assigned customers.')
      setCustomers([])
      setSelectedCustomerId(null)
    } finally {
      clearSlowState()
      setIsCustomersLoading(false)
    }
  }, [beginSlowNetworkTimer, token])

  const loadApprovedItemsForCustomer = useCallback(
    async (customerId: string) => {
      if (!token) {
        setApprovedItems([])
        setApprovedItemsError('Your session is missing. Sign in again to continue.')
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
        setApprovedItemsError(error instanceof Error ? error.message : 'Unable to load approved items.')
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

  const submitApprovedItem = useCallback(async () => {
    if (!token) {
      setAddError('Session expired. Please sign in again.')
      return
    }

    if (!selectedCustomerId) {
      setAddError('Select a customer before adding an approved item.')
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
      setAddInfoMessage(
        mutation.created ? 'Approved item added successfully.' : 'Item already existed in this customer list.',
      )
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'Unable to add approved item.')
    } finally {
      clearSlowState()
      setIsAddingItem(false)
    }
  }, [beginSlowNetworkTimer, newItemId, selectedCustomerId, token])

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.customerId === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  )

  const copyFallbackLink = useCallback(async () => {
    if (!pendingCopyLink) {
      return
    }

    await Clipboard.setStringAsync(pendingCopyLink)
    setMagicLinkInfo('Link copied. Share it manually if WhatsApp is unavailable.')
    setMagicLinkError(null)
    setPendingCopyLink(null)
  }, [pendingCopyLink])

  const generateAndShareLink = useCallback(async () => {
    if (!token) {
      setMagicLinkError('Session expired. Please sign in again.')
      return
    }

    if (!selectedCustomerId) {
      setMagicLinkError('Select a customer before generating a link.')
      return
    }

    setIsGeneratingLink(true)
    setMagicLinkError(null)
    setMagicLinkInfo(null)
    setPendingCopyLink(null)

    let generatedLink: AgentMagicLinkIssueResponse | null = null

    try {
      const payload = await generateMagicLink(token, selectedCustomerId)
      const normalizedPayload = normalizeMagicLinkForShare(payload)
      generatedLink = normalizedPayload
      setLatestMagicLink(normalizedPayload)
      const message = buildMagicLinkShareMessage(selectedCustomerId, normalizedPayload)
      const deepLink = buildWhatsAppDeepLink(message)
      const canOpenWhatsApp = await Linking.canOpenURL(deepLink)

      if (shouldUseCopyLinkFallback(canOpenWhatsApp)) {
        setPendingCopyLink(normalizedPayload.linkUrl)
        setMagicLinkError('WhatsApp is unavailable on this device. Copy the link instead.')
        return
      }

      await Linking.openURL(deepLink)
      setMagicLinkInfo('Magic link generated and ready to send in WhatsApp.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate customer link.'
      setMagicLinkError(message)
      setPendingCopyLink(
        shouldUseCopyLinkFallback(true, error)
          ? generatedLink?.linkUrl ?? null
          : null,
      )
    } finally {
      setIsGeneratingLink(false)
    }
  }, [selectedCustomerId, token])

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Customer Dashboard</Text>
          <Text style={styles.subtitle}>{profile ? `Signed in as ${profile.name}` : 'Signed in for field shift'}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void signOut()
          }}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Assigned customers</Text>
        <Pressable
          accessibilityRole="button"
          disabled={isCustomersLoading}
          onPress={() => {
            void loadCustomers()
          }}
          style={({ pressed }) => [styles.linkButton, (pressed || isCustomersLoading) && styles.linkButtonDisabled]}
        >
          <Text style={styles.linkButtonText}>{isCustomersLoading ? 'Syncing…' : 'Refresh'}</Text>
        </Pressable>
      </View>

      {getResilienceHint(isCustomersSlow, customersError) ? (
        <Text style={customersError ? styles.errorBanner : styles.noticeBanner}>
          {getResilienceHint(isCustomersSlow, customersError)}
        </Text>
      ) : null}

      {isCustomersLoading && customers.length === 0 ? (
        <View style={styles.loadingState}>
          <ActivityIndicator />
          <Text style={styles.mutedText}>Loading your customer assignments…</Text>
        </View>
      ) : customers.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.mutedText}>No assigned customers yet.</Text>
        </View>
      ) : (
        <ScrollView style={styles.customerList} contentContainerStyle={styles.customerListContent}>
          {customers.map((customer) => {
            const isSelected = customer.customerId === selectedCustomerId
            return (
              <Pressable
                accessibilityRole="button"
                key={customer.customerId}
                onPress={() => {
                  setSelectedCustomerId(customer.customerId)
                  setAddError(null)
                  setAddInfoMessage(null)
                }}
                style={({ pressed }) => [
                  styles.customerCard,
                  isSelected && styles.customerCardSelected,
                  pressed && styles.customerCardPressed,
                ]}
              >
                <Text style={styles.customerId}>{customer.customerId}</Text>
                <Text style={styles.customerMeta}>{formatLastOrderLabel(customer.lastOrderAt)}</Text>
                <Text style={styles.customerMeta}>Approved items: {customer.approvedItemsCount}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      )}

      <View style={styles.divider} />

      <View style={styles.addItemPanel}>
        <Text style={styles.addItemTitle}>Share customer order link</Text>
        <Pressable
          accessibilityRole="button"
          disabled={isGeneratingLink || !selectedCustomer}
          onPress={() => {
            void generateAndShareLink()
          }}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || isGeneratingLink || !selectedCustomer) && styles.primaryButtonDisabled,
          ]}
        >
          {isGeneratingLink ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Generate & send via WhatsApp</Text>
          )}
        </Pressable>
        {magicLinkError ? <Text style={styles.errorText}>{magicLinkError}</Text> : null}
        {magicLinkInfo ? <Text style={styles.noticeText}>{magicLinkInfo}</Text> : null}
        {pendingCopyLink ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void copyFallbackLink()
            }}
            style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonDisabled]}
          >
            <Text style={styles.linkButtonText}>Copy link fallback</Text>
          </Pressable>
        ) : null}
        {latestMagicLink ? (
          <Text style={styles.customerMeta}>
            Expires {formatMagicLinkExpiry(latestMagicLink.expiresAt)} · TTL {latestMagicLink.expiresInSeconds}s ·{' '}
            {latestMagicLink.lifecycle}
          </Text>
        ) : null}
      </View>

      <View style={styles.divider} />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Approved items</Text>
        {selectedCustomer ? <Text style={styles.sectionMeta}>{selectedCustomer.customerId}</Text> : null}
      </View>

      {getResilienceHint(isApprovedItemsSlow, approvedItemsError) ? (
        <Text style={approvedItemsError ? styles.errorBanner : styles.noticeBanner}>
          {getResilienceHint(isApprovedItemsSlow, approvedItemsError)}
        </Text>
      ) : null}

      {!selectedCustomer ? (
        <View style={styles.emptyState}>
          <Text style={styles.mutedText}>Select a customer to manage approved items.</Text>
        </View>
      ) : isApprovedItemsLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator />
          <Text style={styles.mutedText}>Loading approved items…</Text>
        </View>
      ) : approvedItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.mutedText}>No approved items yet for this customer.</Text>
        </View>
      ) : (
        <ScrollView style={styles.approvedItemsList} contentContainerStyle={styles.approvedItemsListContent}>
          {approvedItems.map((item) => (
            <View key={`${item.hashItemId}-${item.createdAt}`} style={styles.approvedItemRow}>
              <Text style={styles.approvedItemId}>{item.hashItemId}</Text>
              <Text style={styles.approvedItemMeta}>Added by {item.addedByAgentId}</Text>
              <Text style={styles.approvedItemMeta}>{formatApprovedItemTimestamp(item.createdAt)}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.addItemPanel}>
        <Text style={styles.addItemTitle}>Add approved item</Text>
        <TextInput
          accessibilityLabel="Approved item ID"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isAddingItem}
          placeholder="itm-123"
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

        {getResilienceHint(isAddSlow, addError) ? (
          <Text style={addError ? styles.errorText : styles.noticeText}>{getResilienceHint(isAddSlow, addError)}</Text>
        ) : null}
        {addInfoMessage ? <Text style={styles.noticeText}>{addInfoMessage}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={isAddingItem || !selectedCustomer || !newItemId.trim()}
          onPress={() => {
            void submitApprovedItem()
          }}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || isAddingItem || !selectedCustomer || !newItemId.trim()) && styles.primaryButtonDisabled,
          ]}
        >
          {isAddingItem ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Add item</Text>}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: palette.background,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: palette.primaryContainer,
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  subtitle: {
    marginTop: 4,
    color: palette.textMuted,
    fontSize: 14,
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  sectionHeader: {
    marginTop: 4,
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.primary,
  },
  sectionMeta: {
    color: palette.secondary,
    fontWeight: '600',
  },
  mutedText: {
    color: palette.textMuted,
  },
  loadingState: {
    minHeight: 70,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  emptyState: {
    minHeight: 70,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  customerList: {
    maxHeight: 190,
  },
  customerListContent: {
    gap: 8,
  },
  customerCard: {
    borderWidth: 0,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    padding: 12,
    gap: 4,
    minHeight: touchTarget.comfortable,
    justifyContent: 'center',
  },
  customerCardSelected: {
    backgroundColor: palette.surfaceHighest,
  },
  customerCardPressed: {
    opacity: 0.85,
  },
  customerId: {
    fontWeight: '700',
    color: palette.primary,
  },
  customerMeta: {
    color: palette.textMuted,
    fontSize: 13,
  },
  divider: {
    height: spacing.sm,
    backgroundColor: 'transparent',
    marginVertical: 2,
  },
  approvedItemsList: {
    maxHeight: 170,
  },
  approvedItemsListContent: {
    gap: 8,
  },
  approvedItemRow: {
    borderWidth: 0,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    padding: 10,
    gap: 2,
  },
  approvedItemId: {
    fontWeight: '700',
    color: palette.primary,
  },
  approvedItemMeta: {
    fontSize: 12,
    color: palette.textMuted,
  },
  addItemPanel: {
    marginTop: 2,
    backgroundColor: palette.surfaceMid,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 8,
  },
  addItemTitle: {
    fontWeight: '700',
    color: palette.primary,
  },
  input: {
    borderWidth: 0,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: palette.surface,
    color: palette.text,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
    writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr',
    minHeight: touchTarget.comfortable,
  },
  primaryButton: {
    marginTop: 2,
    borderRadius: radius.md,
    backgroundColor: palette.primaryContainer,
    minHeight: touchTarget.comfortable,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: radius.md,
    minHeight: touchTarget.min,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    backgroundColor: palette.secondaryFixed,
  },
  secondaryButtonText: {
    fontWeight: '600',
    color: palette.primary,
  },
  linkButton: {
    minHeight: touchTarget.min,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButtonDisabled: {
    opacity: 0.7,
  },
  linkButtonText: {
    color: palette.primaryContainer,
    fontWeight: '600',
  },
  errorBanner: {
    borderWidth: 0,
    backgroundColor: palette.dangerSurface,
    borderRadius: radius.sm,
    padding: 10,
    color: palette.danger,
    fontSize: 13,
  },
  noticeBanner: {
    borderWidth: 0,
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
})
