import type {
  AgentApprovedItemMutationResponse,
  AgentApprovedItemsResponse,
  AgentAssignedCustomer,
  AgentOrderCancelResponse,
  AgentOrderCard,
  AgentOrdersResponse,
  AgentCustomersResponse,
  AgentMagicLinkIssueResponse,
} from '@meatland/shared-types'
import { z } from 'zod'

import { fetchWithBaseUrlFallback } from './api-base-url-fallback'

const AGENT_ASSIGNED_CUSTOMER_SCHEMA: z.ZodType<AgentAssignedCustomer> = z.object({
  customerId: z.string().trim().min(1),
  approvedItemsCount: z.number().int().nonnegative(),
  lastOrderAt: z.string().datetime().nullable(),
})

const AGENT_CUSTOMERS_RESPONSE_SCHEMA: z.ZodType<AgentCustomersResponse> = z.object({
  customers: z.array(AGENT_ASSIGNED_CUSTOMER_SCHEMA),
  total: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
})

const AGENT_APPROVED_ITEMS_RESPONSE_SCHEMA: z.ZodType<AgentApprovedItemsResponse> = z.object({
  customerId: z.string().trim().min(1),
  items: z.array(
    z.object({
      hashItemId: z.string().trim().min(1),
      addedByAgentId: z.string().trim().min(1),
      createdAt: z.string().datetime(),
    }),
  ),
  total: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
})

const AGENT_APPROVED_ITEM_MUTATION_RESPONSE_SCHEMA: z.ZodType<AgentApprovedItemMutationResponse> = z.object({
  customerId: z.string().trim().min(1),
  created: z.boolean(),
  item: z.object({
    hashItemId: z.string().trim().min(1),
    addedByAgentId: z.string().trim().min(1),
    createdAt: z.string().datetime(),
  }),
})

const AGENT_MAGIC_LINK_RESPONSE_SCHEMA: z.ZodType<AgentMagicLinkIssueResponse> = z.object({
  linkUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  expiresInSeconds: z.number().int().positive(),
  lifecycle: z.literal('issued'),
})

const AGENT_ORDER_CARD_SCHEMA: z.ZodType<AgentOrderCard> = z.object({
  orderId: z.string().trim().min(1),
  orderRef: z.string().trim().min(1).nullable(),
  customerId: z.string().trim().min(1),
  customerName: z.string().trim().min(1),
  submittedAt: z.string().datetime(),
  status: z.union([z.literal('submitted'), z.literal('pending_retry'), z.literal('failed')]),
  estimatedTotal: z.number().nonnegative(),
  currency: z.string().trim().min(1),
  items: z.array(
    z.object({
      itemId: z.string().trim().min(1),
      itemName: z.string().trim().min(1),
      quantity: z.number().nonnegative(),
      unit: z.union([z.literal('kg'), z.literal('unit')]),
      lineTotal: z.number().nonnegative(),
    }),
  ),
  canCancel: z.boolean(),
})

const AGENT_ORDERS_RESPONSE_SCHEMA: z.ZodType<AgentOrdersResponse> = z.object({
  orders: z.array(AGENT_ORDER_CARD_SCHEMA),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().positive(),
  generatedAt: z.string().datetime(),
})

const AGENT_ORDER_CANCEL_RESPONSE_SCHEMA: z.ZodType<AgentOrderCancelResponse> = z.object({
  orderId: z.string().trim().min(1),
  removed: z.boolean(),
  status: z.literal('cancelled'),
  canceledAt: z.string().datetime(),
  mode: z.union([z.literal('testing_local_delete'), z.literal('hashavshevet')]),
})

function parseErrorBody(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidate = (payload as { message?: unknown }).message
  return typeof candidate === 'string' && candidate.trim() ? candidate : null
}

function mapAgentApiError(status: number, payload: unknown): Error {
  const fallback =
    status === 401
      ? 'תוקף הסשן פג. התחברו מחדש.'
      : status === 403
        ? 'עדיין לא שובצתם ללקוח הזה.'
        : status === 404
          ? 'ההזמנה המבוקשת לא נמצאה עבור החשבון שלכם.'
        : 'לא ניתן להתחבר ל-Meatland כעת. נסו שוב.'

  return new Error(parseErrorBody(payload) ?? fallback)
}

async function parseValidatedResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw mapAgentApiError(response.status, payload)
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new Error('התקבלה תשובה לא צפויה מהשרת.')
  }

  return parsed.data
}

async function requestAgentApi(path: string, init: RequestInit): Promise<Response> {
  const { response } = await fetchWithBaseUrlFallback(path, init, {
    requestLabel: 'שרת ה-API',
    timeoutMs: 8000,
  })

  return response
}

export async function listAssignedCustomers(accessToken: string): Promise<AgentCustomersResponse> {
  const response = await requestAgentApi('/v1/agent/customers', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })

  return parseValidatedResponse(response, AGENT_CUSTOMERS_RESPONSE_SCHEMA)
}

export async function listApprovedItems(
  accessToken: string,
  customerId: string,
): Promise<AgentApprovedItemsResponse> {
  const response = await requestAgentApi(`/v1/agent/customers/${encodeURIComponent(customerId)}/approved-items`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })

  return parseValidatedResponse(response, AGENT_APPROVED_ITEMS_RESPONSE_SCHEMA)
}

export async function addApprovedItem(
  accessToken: string,
  customerId: string,
  hashItemId: string,
): Promise<AgentApprovedItemMutationResponse> {
  const normalizedHashItemId = hashItemId.trim()

  if (!normalizedHashItemId) {
    throw new Error('יש להזין מזהה פריט לפני ההוספה.')
  }

  const response = await requestAgentApi(`/v1/agent/customers/${encodeURIComponent(customerId)}/approved-items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ hashItemId: normalizedHashItemId }),
  })

  return parseValidatedResponse(response, AGENT_APPROVED_ITEM_MUTATION_RESPONSE_SCHEMA)
}

export async function generateMagicLink(
  accessToken: string,
  customerId: string,
): Promise<AgentMagicLinkIssueResponse> {
  const response = await requestAgentApi(`/v1/agent/customers/${encodeURIComponent(customerId)}/magic-links`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })

  return parseValidatedResponse(response, AGENT_MAGIC_LINK_RESPONSE_SCHEMA)
}

export async function listAgentOrders(
  accessToken: string,
  filters: {
    page?: number
    pageSize?: number
    fromDate?: string
    toDate?: string
    query?: string
  } = {},
): Promise<AgentOrdersResponse> {
  const params = new URLSearchParams()

  if (filters.page && filters.page > 0) {
    params.set('page', String(filters.page))
  }

  if (filters.pageSize && filters.pageSize > 0) {
    params.set('pageSize', String(filters.pageSize))
  }

  if (filters.fromDate?.trim()) {
    params.set('fromDate', filters.fromDate.trim())
  }

  if (filters.toDate?.trim()) {
    params.set('toDate', filters.toDate.trim())
  }

  if (filters.query?.trim()) {
    params.set('query', filters.query.trim())
  }

  const querySuffix = params.toString().length > 0 ? `?${params.toString()}` : ''
  const response = await requestAgentApi(`/v1/agent/orders${querySuffix}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })

  return parseValidatedResponse(response, AGENT_ORDERS_RESPONSE_SCHEMA)
}

export async function cancelAgentOrder(
  accessToken: string,
  orderId: string,
  reason?: string,
): Promise<AgentOrderCancelResponse> {
  const normalizedOrderId = orderId.trim()
  if (!normalizedOrderId) {
    throw new Error('נדרש מזהה הזמנה כדי לבטל הזמנה.')
  }

  const response = await requestAgentApi(`/v1/agent/orders/${encodeURIComponent(normalizedOrderId)}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    }),
  })

  return parseValidatedResponse(response, AGENT_ORDER_CANCEL_RESPONSE_SCHEMA)
}
