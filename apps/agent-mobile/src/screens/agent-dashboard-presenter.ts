import type {
  AgentApprovedItem,
  AgentApprovedItemMutationResponse,
  AgentAssignedCustomer,
  AgentMagicLinkIssueResponse,
} from '@meatland/shared-types'

export type AgentDashboardTabId = 'home' | 'customers' | 'orders' | 'settings'

export type AgentRecentTransactionKind = 'magic_link' | 'order' | 'approved_item'

export interface AgentRecentTransaction {
  id: string
  customerId: string
  kind: AgentRecentTransactionKind
  title: string
  detail: string
  reference: string
  sortTimestamp: number
}

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
  return `שלום, מצורף קישור ההזמנה שלך עבור לקוח ${customerId}: ${normalizeLocalMagicLinkUrl(payload.linkUrl)} (בתוקף עד ${formatMagicLinkExpiry(payload.expiresAt)}).`
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

function parseTimestamp(value: string | null): number | null {
  if (!value) {
    return null
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function formatRelativeTimestampHebrew(timestampMs: number, nowMs: number): string {
  const elapsedMinutes = Math.max(1, Math.floor((nowMs - timestampMs) / 60000))

  if (elapsedMinutes < 60) {
    return `לפני ${elapsedMinutes} דקות`
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) {
    return `לפני ${elapsedHours} שעות`
  }

  return new Date(timestampMs).toLocaleDateString('he-IL')
}

export function buildRecentTransactions(input: {
  customers: AgentAssignedCustomer[]
  approvedItems: AgentApprovedItem[]
  selectedCustomerId: string | null
  latestMagicLink: AgentMagicLinkIssueResponse | null
  latestMagicLinkCustomerId: string | null
  latestMagicLinkIssuedAt: string | null
  nowMs?: number
  limit?: number
}): AgentRecentTransaction[] {
  const {
    customers,
    approvedItems,
    selectedCustomerId,
    latestMagicLink,
    latestMagicLinkCustomerId,
    latestMagicLinkIssuedAt,
    nowMs = Date.now(),
    limit = 6,
  } = input

  const timeline: AgentRecentTransaction[] = []

  const magicLinkTimestamp = parseTimestamp(latestMagicLinkIssuedAt)
  if (latestMagicLink && latestMagicLinkCustomerId && magicLinkTimestamp) {
    const customerLabel = humanizeIdentifier(latestMagicLinkCustomerId, ['cust-'])
    timeline.push({
      id: `magic-link-${latestMagicLinkCustomerId}-${magicLinkTimestamp}`,
      customerId: latestMagicLinkCustomerId,
      kind: 'magic_link',
      title: `קישור נשלח • ${customerLabel}`,
      detail: `${formatRelativeTimestampHebrew(magicLinkTimestamp, nowMs)} • תוקף ${latestMagicLink.expiresInSeconds} שנ׳`,
      reference: latestMagicLink.lifecycle,
      sortTimestamp: magicLinkTimestamp,
    })
  }

  for (const customer of customers) {
    const orderTimestamp = parseTimestamp(customer.lastOrderAt)
    if (!orderTimestamp) {
      continue
    }

    const customerLabel = humanizeIdentifier(customer.customerId, ['cust-'])
    timeline.push({
      id: `order-${customer.customerId}-${orderTimestamp}`,
      customerId: customer.customerId,
      kind: 'order',
      title: `הזמנה עודכנה • ${customerLabel}`,
      detail: `${formatRelativeTimestampHebrew(orderTimestamp, nowMs)} • פריטים מאושרים ${customer.approvedItemsCount}`,
      reference: '#ORDER',
      sortTimestamp: orderTimestamp,
    })
  }

  if (selectedCustomerId) {
    const customerLabel = humanizeIdentifier(selectedCustomerId, ['cust-'])
    for (const item of approvedItems) {
      const createdAtTimestamp = parseTimestamp(item.createdAt)
      if (!createdAtTimestamp) {
        continue
      }

      const itemLabel = humanizeIdentifier(item.hashItemId, ['itm-'])
      timeline.push({
        id: `approved-${selectedCustomerId}-${item.hashItemId}-${createdAtTimestamp}`,
        customerId: selectedCustomerId,
        kind: 'approved_item',
        title: `פריט מאושר • ${itemLabel}`,
        detail: `${formatRelativeTimestampHebrew(createdAtTimestamp, nowMs)} • ${customerLabel}`,
        reference: 'עדכון קטלוג',
        sortTimestamp: createdAtTimestamp,
      })
    }
  }

  return timeline.sort((left, right) => right.sortTimestamp - left.sortTimestamp).slice(0, limit)
}
