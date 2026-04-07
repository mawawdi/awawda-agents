import type {
  AgentApprovedItem,
  AgentApprovedItemMutationResponse,
  AgentAssignedCustomer,
  AgentMagicLinkIssueResponse,
} from '@meatland/shared-types'

function normalizeLocalMagicLinkUrl(linkUrl: string): string {
  try {
    const parsed = new URL(linkUrl)
    const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'

    if (isLocalHost && parsed.protocol === 'https:') {
      parsed.protocol = 'http:'
      return parsed.toString()
    }
  } catch {
    return linkUrl
  }

  return linkUrl
}

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

export function formatMagicLinkExpiry(expiresAt: string): string {
  const parsed = Date.parse(expiresAt)
  if (Number.isNaN(parsed)) {
    return 'Expiry unavailable'
  }

  return new Date(parsed).toLocaleString()
}

export function buildMagicLinkShareMessage(customerId: string, payload: AgentMagicLinkIssueResponse): string {
  return `Hi! Here is your Meatland ordering link for ${customerId}: ${normalizeLocalMagicLinkUrl(payload.linkUrl)} (expires ${formatMagicLinkExpiry(payload.expiresAt)}).`
}

export function normalizeMagicLinkForShare(payload: AgentMagicLinkIssueResponse): AgentMagicLinkIssueResponse {
  return {
    ...payload,
    linkUrl: normalizeLocalMagicLinkUrl(payload.linkUrl),
  }
}

export function buildWhatsAppDeepLink(message: string): string {
  return `whatsapp://send?text=${encodeURIComponent(message)}`
}

export function shouldUseCopyLinkFallback(canOpenWhatsApp: boolean, dispatchError: unknown = null): boolean {
  return !canOpenWhatsApp || dispatchError instanceof Error
}
