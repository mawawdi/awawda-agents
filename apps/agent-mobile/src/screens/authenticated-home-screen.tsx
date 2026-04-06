import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { AgentApprovedItem, AgentAssignedCustomer } from '@meatland/shared-types'

import { addApprovedItem, listApprovedItems, listAssignedCustomers } from '../api/agent-customers-client'
import { useAuth } from '../auth/auth-provider'
import {
  applyApprovedCountMutation,
  formatApprovedItemTimestamp,
  formatLastOrderLabel,
  getResilienceHint,
  mergeApprovedItems,
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
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 12,
    backgroundColor: '#f9fafb',
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginTop: 4,
    color: '#4b5563',
    fontSize: 14,
  },
  sectionHeader: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  sectionMeta: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  mutedText: {
    color: '#6b7280',
  },
  loadingState: {
    minHeight: 70,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
  },
  emptyState: {
    minHeight: 70,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  customerList: {
    maxHeight: 190,
  },
  customerListContent: {
    gap: 8,
  },
  customerCard: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#fff',
    padding: 12,
    gap: 4,
  },
  customerCardSelected: {
    borderColor: '#1d4ed8',
    backgroundColor: '#eff6ff',
  },
  customerCardPressed: {
    opacity: 0.85,
  },
  customerId: {
    fontWeight: '700',
    color: '#111827',
  },
  customerMeta: {
    color: '#4b5563',
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 2,
  },
  approvedItemsList: {
    maxHeight: 170,
  },
  approvedItemsListContent: {
    gap: 8,
  },
  approvedItemRow: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#fff',
    padding: 10,
    gap: 2,
  },
  approvedItemId: {
    fontWeight: '700',
    color: '#111827',
  },
  approvedItemMeta: {
    fontSize: 12,
    color: '#4b5563',
  },
  addItemPanel: {
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
    gap: 8,
  },
  addItemTitle: {
    fontWeight: '700',
    color: '#111827',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  primaryButton: {
    marginTop: 2,
    borderRadius: 10,
    backgroundColor: '#1d4ed8',
    minHeight: 44,
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
    borderRadius: 10,
    minHeight: 38,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  secondaryButtonText: {
    fontWeight: '600',
    color: '#1f2937',
  },
  linkButton: {
    minHeight: 34,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButtonDisabled: {
    opacity: 0.7,
  },
  linkButtonText: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  errorBanner: {
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    padding: 10,
    color: '#991b1b',
    fontSize: 13,
  },
  noticeBanner: {
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    padding: 10,
    color: '#92400e',
    fontSize: 13,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
  },
  noticeText: {
    color: '#92400e',
    fontSize: 13,
  },
})
