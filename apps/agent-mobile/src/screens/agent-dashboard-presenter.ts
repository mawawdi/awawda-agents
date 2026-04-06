import type {
  AgentApprovedItem,
  AgentApprovedItemMutationResponse,
  AgentAssignedCustomer,
} from '@meatland/shared-types'

export function formatLastOrderLabel(lastOrderAt: string | null): string {
  if (!lastOrderAt) {
    return 'No recent order'
  }

  const parsed = Date.parse(lastOrderAt)
  if (Number.isNaN(parsed)) {
    return 'Last order date unavailable'
  }

  return `Last order ${new Date(parsed).toLocaleDateString()}`
}

export function formatApprovedItemTimestamp(createdAt: string): string {
  const parsed = Date.parse(createdAt)
  if (Number.isNaN(parsed)) {
    return 'Added recently'
  }

  return new Date(parsed).toLocaleString()
}

export function mergeApprovedItems(
  currentItems: AgentApprovedItem[],
  mutation: AgentApprovedItemMutationResponse,
): AgentApprovedItem[] {
  const withoutExisting = currentItems.filter((item) => item.hashItemId !== mutation.item.hashItemId)
  return [mutation.item, ...withoutExisting]
}

export function applyApprovedCountMutation(
  customers: AgentAssignedCustomer[],
  customerId: string,
  created: boolean,
): AgentAssignedCustomer[] {
  if (!created) {
    return customers
  }

  return customers.map((customer) =>
    customer.customerId === customerId
      ? {
          ...customer,
          approvedItemsCount: customer.approvedItemsCount + 1,
        }
      : customer,
  )
}

export function getResilienceHint(isSlow: boolean, errorMessage: string | null): string | null {
  if (errorMessage) {
    return errorMessage
  }

  if (isSlow) {
    return 'Network is slower than usual. Keep this screen open while we sync.'
  }

  return null
}
