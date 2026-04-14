import type {
  AgentApprovedItem,
  AgentApprovedItemMutationResponse,
  AgentAssignedCustomer,
  AgentMagicLinkIssueResponse,
} from '@meatland/shared-types'

export type AgentDashboardTabId = 'home' | 'customers' | 'orders' | 'settings'

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function humanizeIdentifier(value: string, prefixes: string[] = []): string {
  let normalized = value.trim()
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length)
      break
    }
  }
  return toTitleCase(normalized.replaceAll('-', ' '))
}

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
    return 'ללא הזמנה קודמת'
  }

  const parsed = Date.parse(lastOrderAt)
  if (Number.isNaN(parsed)) {
    return 'תאריך הזמנה אחרונה לא זמין'
  }

  return `הזמנה אחרונה ${new Date(parsed).toLocaleDateString('he-IL')}`
}

export function formatApprovedItemTimestamp(createdAt: string): string {
  const parsed = Date.parse(createdAt)
  if (Number.isNaN(parsed)) {
    return 'נוסף לאחרונה'
  }

  return new Date(parsed).toLocaleString('he-IL')
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
    return 'הרשת איטית מהרגיל. השאירו את המסך פתוח בזמן הסנכרון.'
  }

  return null
}

export function formatMagicLinkExpiry(expiresAt: string): string {
  const parsed = Date.parse(expiresAt)
  if (Number.isNaN(parsed)) {
    return 'מועד תפוגה לא זמין'
  }

  return new Date(parsed).toLocaleString('he-IL')
}

export function buildMagicLinkShareMessage(customerId: string, payload: AgentMagicLinkIssueResponse): string {
  const customerLabel = humanizeIdentifier(customerId, ['cust-'])
  return `שלום, מצורף קישור ההזמנה שלך עבור ${customerLabel}: ${normalizeLocalMagicLinkUrl(payload.linkUrl)} (בתוקף עד ${formatMagicLinkExpiry(payload.expiresAt)}).`
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

export function magicLinkLifecycleLabel(lifecycle: string): string {
  if (lifecycle === 'issued') {
    return 'קישור פעיל'
  }
  if (lifecycle === 'consumed') {
    return 'הוזן בהצלחה'
  }
  if (lifecycle === 'expired') {
    return 'פג תוקף'
  }
  return 'עדכון קישור'
}
