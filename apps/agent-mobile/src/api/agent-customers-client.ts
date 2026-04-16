import type {
  AgentApprovedItemMutationResponse,
  AgentApprovedItemsResponse,
  AgentAssignedCustomer,
  AgentCustomersResponse,
  AgentOrderCancelResponse,
  AgentOrderCard,
  AgentOrdersResponse,
  AgentMagicLinkIssueResponse,
  SupervisorAgentCreateRequest,
  SupervisorAgentCreateResponse,
  SupervisorAgentForceLogoutRequest,
  SupervisorAgentForceLogoutResponse,
  SupervisorAgentOverview,
  SupervisorAgentAccessUpdateRequest,
  SupervisorAgentAccessUpdateResponse,
  SupervisorAuditEntry,
  SupervisorAuditLogResponse,
  SupervisorBulkReassignRequest,
  SupervisorBulkReassignResponse,
  SupervisorAgentsResponse,
  SupervisorCustomerAssignAgentResponse,
  SupervisorCustomerAssignmentsResponse,
  SupervisorCustomerOverview,
  SupervisorCustomerProfileUpdateRequest,
  SupervisorCustomerProfileUpdateResponse,
  SupervisorCustomersResponse,
  SupervisorOversightResponse,
  SupervisorCustomerUnassignAgentResponse,
} from '@awawda/shared-types'
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

const SUPERVISOR_AGENT_OVERVIEW_SCHEMA: z.ZodType<SupervisorAgentOverview> = z.object({
  agentId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  email: z.string().trim().email().nullable(),
  role: z.union([z.literal('field_agent'), z.literal('supervisor')]),
  isActive: z.boolean(),
  assignmentCount: z.number().int().nonnegative(),
})

const SUPERVISOR_AGENTS_RESPONSE_SCHEMA: z.ZodType<SupervisorAgentsResponse> = z.object({
  agents: z.array(SUPERVISOR_AGENT_OVERVIEW_SCHEMA),
  total: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
})

const SUPERVISOR_CUSTOMER_ASSIGNMENT_METADATA_SCHEMA = z.object({
  assignmentCount: z.number().int().nonnegative(),
  assignedAgentIds: z.array(z.string().trim().min(1)),
  lastAssignedAt: z.string().datetime().nullable(),
})

const SUPERVISOR_CUSTOMER_OVERVIEW_SCHEMA: z.ZodType<SupervisorCustomerOverview> = z.object({
  customerId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  contactName: z.string().trim().min(1).nullable(),
  phone: z.string().trim().min(1).nullable(),
  city: z.string().trim().min(1).nullable(),
  notes: z.string().nullable(),
  status: z.union([z.literal('active'), z.literal('inactive'), z.literal('on_hold')]),
  updatedAt: z.string().datetime(),
  assignment: SUPERVISOR_CUSTOMER_ASSIGNMENT_METADATA_SCHEMA,
})

const SUPERVISOR_CUSTOMERS_RESPONSE_SCHEMA: z.ZodType<SupervisorCustomersResponse> = z.object({
  customers: z.array(SUPERVISOR_CUSTOMER_OVERVIEW_SCHEMA),
  total: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
})

const SUPERVISOR_AGENT_ASSIGNMENT_SCHEMA = z.object({
  customerId: z.string().trim().min(1),
  agentId: z.string().trim().min(1),
  assignedAt: z.string().datetime(),
})

const SUPERVISOR_CUSTOMER_ASSIGNMENTS_RESPONSE_SCHEMA: z.ZodType<SupervisorCustomerAssignmentsResponse> = z.object({
  customerId: z.string().trim().min(1),
  assignments: z.array(SUPERVISOR_AGENT_ASSIGNMENT_SCHEMA),
  total: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
})

const SUPERVISOR_CUSTOMER_ASSIGN_AGENT_RESPONSE_SCHEMA: z.ZodType<SupervisorCustomerAssignAgentResponse> = z.object({
  customerId: z.string().trim().min(1),
  assignment: SUPERVISOR_AGENT_ASSIGNMENT_SCHEMA,
  created: z.boolean(),
})

const SUPERVISOR_CUSTOMER_UNASSIGN_AGENT_RESPONSE_SCHEMA: z.ZodType<SupervisorCustomerUnassignAgentResponse> = z.object({
  customerId: z.string().trim().min(1),
  agentId: z.string().trim().min(1),
  removed: z.boolean(),
  removedAt: z.string().datetime(),
})

const SUPERVISOR_CUSTOMER_PROFILE_UPDATE_RESPONSE_SCHEMA: z.ZodType<SupervisorCustomerProfileUpdateResponse> = z.object({
  customerId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  contactName: z.string().trim().min(1).nullable(),
  phone: z.string().trim().min(1).nullable(),
  city: z.string().trim().min(1).nullable(),
  notes: z.string().nullable(),
  status: z.union([z.literal('active'), z.literal('inactive'), z.literal('on_hold')]),
  updatedAt: z.string().datetime(),
})

const SUPERVISOR_AGENT_ACCESS_UPDATE_RESPONSE_SCHEMA: z.ZodType<SupervisorAgentAccessUpdateResponse> = z.object({
  agent: SUPERVISOR_AGENT_OVERVIEW_SCHEMA,
  changed: z.boolean(),
  reason: z.string().nullable(),
  updatedAt: z.string().datetime(),
})

const SUPERVISOR_AGENT_CREATE_RESPONSE_SCHEMA: z.ZodType<SupervisorAgentCreateResponse> = z.object({
  agent: SUPERVISOR_AGENT_OVERVIEW_SCHEMA,
  createdAt: z.string().datetime(),
})

const SUPERVISOR_AGENT_FORCE_LOGOUT_RESPONSE_SCHEMA: z.ZodType<SupervisorAgentForceLogoutResponse> = z.object({
  agentId: z.string().trim().min(1),
  revoked: z.boolean(),
  reason: z.string().nullable(),
  revokedAt: z.string().datetime(),
})

const SUPERVISOR_BULK_REASSIGN_RESPONSE_SCHEMA: z.ZodType<SupervisorBulkReassignResponse> = z.object({
  fromAgentId: z.string().trim().min(1),
  toAgentId: z.string().trim().min(1),
  requestedCustomers: z.number().int().nonnegative(),
  reassignedCustomers: z.number().int().nonnegative(),
  skippedCustomers: z.number().int().nonnegative(),
  createdAssignments: z.number().int().nonnegative(),
  removedAssignments: z.number().int().nonnegative(),
  processedCustomerIds: z.array(z.string().trim().min(1)),
  generatedAt: z.string().datetime(),
})

const SUPERVISOR_AUDIT_ENTRY_SCHEMA: z.ZodType<SupervisorAuditEntry> = z.object({
  id: z.string().trim().min(1),
  actorType: z.union([z.literal('agent'), z.literal('customer_session'), z.literal('system')]),
  actorId: z.string().trim().min(1),
  eventType: z.string().trim().min(1),
  eventPayload: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string().datetime(),
})

const SUPERVISOR_AUDIT_LOG_RESPONSE_SCHEMA: z.ZodType<SupervisorAuditLogResponse> = z.object({
  entries: z.array(SUPERVISOR_AUDIT_ENTRY_SCHEMA),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().positive(),
  generatedAt: z.string().datetime(),
})

const SUPERVISOR_OVERSIGHT_RESPONSE_SCHEMA: z.ZodType<SupervisorOversightResponse> = z.object({
  window: z.object({
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    timezone: z.string().trim().min(1),
  }),
  orders: z.object({
    totalOrders: z.number().int().nonnegative(),
    submittedCount: z.number().int().nonnegative(),
    pendingRetryCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    totalAmount: z.number().nonnegative(),
    byAgent: z.array(
      z.object({
        agentId: z.string().trim().min(1).nullable(),
        agentName: z.string().trim().min(1),
        orderCount: z.number().int().nonnegative(),
        submittedCount: z.number().int().nonnegative(),
        pendingRetryCount: z.number().int().nonnegative(),
        failedCount: z.number().int().nonnegative(),
        totalAmount: z.number().nonnegative(),
      }),
    ),
    byCustomer: z.array(
      z.object({
        customerId: z.string().trim().min(1),
        customerName: z.string().trim().min(1),
        assignedAgentId: z.string().trim().min(1).nullable(),
        assignedAgentName: z.string().trim().min(1).nullable(),
        orderCount: z.number().int().nonnegative(),
        submittedCount: z.number().int().nonnegative(),
        pendingRetryCount: z.number().int().nonnegative(),
        failedCount: z.number().int().nonnegative(),
        totalAmount: z.number().nonnegative(),
      }),
    ),
  }),
  unassignedCustomers: z.object({
    total: z.number().int().nonnegative(),
    customers: z.array(SUPERVISOR_CUSTOMER_OVERVIEW_SCHEMA),
  }),
  erp: z.object({
    pendingRetryCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    totalNeedingAttention: z.number().int().nonnegative(),
    recentSignals: z.array(
      z.object({
        orderId: z.string().trim().min(1),
        orderRef: z.string().trim().min(1).nullable(),
        customerId: z.string().trim().min(1),
        customerName: z.string().trim().min(1),
        assignedAgentId: z.string().trim().min(1).nullable(),
        assignedAgentName: z.string().trim().min(1).nullable(),
        status: z.union([z.literal('pending_retry'), z.literal('failed')]),
        submittedAt: z.string().datetime(),
        estimatedTotal: z.number().nonnegative(),
      }),
    ),
  }),
  funnel: z.object({
    magicLinksIssued: z.number().int().nonnegative(),
    activationAttempts: z.number().int().nonnegative(),
    activationSuccesses: z.number().int().nonnegative(),
    sessionsActivated: z.number().int().nonnegative(),
    ordersSubmitted: z.number().int().nonnegative(),
    activationSuccessRate: z.number().nonnegative(),
    linkToSessionConversionRate: z.number().nonnegative(),
    sessionToOrderConversionRate: z.number().nonnegative(),
  }),
  generatedAt: z.string().datetime(),
})

function parseErrorBody(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidate = (payload as { message?: unknown }).message
  if (typeof candidate !== 'string') {
    return null
  }

  const normalized = candidate.trim()
  if (!normalized) {
    return null
  }

  if (/^Cannot (GET|POST|PUT|PATCH|DELETE)\s+/i.test(normalized)) {
    return null
  }

  return normalized
}

export class AgentApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AgentApiError'
    this.status = status
  }
}

function mapAgentApiError(status: number, payload: unknown): Error {
  const fallback =
    status === 401
      ? 'תוקף הסשן פג. התחברו מחדש.'
      : status === 403
        ? 'עדיין לא שובצתם ללקוח הזה.'
        : status === 404
          ? 'המשאב המבוקש לא נמצא.'
        : 'לא ניתן להתחבר לעואודה לשיווק בע״מ כעת. נסו שוב.'

  return new AgentApiError(parseErrorBody(payload) ?? fallback, status)
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

export async function listSupervisorAgents(accessToken: string): Promise<SupervisorAgentsResponse> {
  const response = await requestAgentApi('/v1/supervisor/agents', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })

  return parseValidatedResponse(response, SUPERVISOR_AGENTS_RESPONSE_SCHEMA)
}

export async function createSupervisorAgent(
  accessToken: string,
  payload: SupervisorAgentCreateRequest,
): Promise<SupervisorAgentCreateResponse> {
  const response = await requestAgentApi('/v1/supervisor/agents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  return parseValidatedResponse(response, SUPERVISOR_AGENT_CREATE_RESPONSE_SCHEMA)
}

export async function listSupervisorCustomers(accessToken: string): Promise<SupervisorCustomersResponse> {
  const response = await requestAgentApi('/v1/supervisor/customers', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })

  return parseValidatedResponse(response, SUPERVISOR_CUSTOMERS_RESPONSE_SCHEMA)
}

export async function listSupervisorCustomerAssignments(
  accessToken: string,
  customerId: string,
): Promise<SupervisorCustomerAssignmentsResponse> {
  const response = await requestAgentApi(`/v1/supervisor/customers/${encodeURIComponent(customerId)}/assignments`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })

  return parseValidatedResponse(response, SUPERVISOR_CUSTOMER_ASSIGNMENTS_RESPONSE_SCHEMA)
}

export async function assignSupervisorCustomer(
  accessToken: string,
  customerId: string,
  agentId: string,
): Promise<SupervisorCustomerAssignAgentResponse> {
  const normalizedAgentId = agentId.trim()
  if (!normalizedAgentId) {
    throw new Error('נדרש מזהה סוכן תקין לצורך שיוך הלקוח.')
  }

  const response = await requestAgentApi(`/v1/supervisor/customers/${encodeURIComponent(customerId)}/assignments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      agentId: normalizedAgentId,
    }),
  })

  return parseValidatedResponse(response, SUPERVISOR_CUSTOMER_ASSIGN_AGENT_RESPONSE_SCHEMA)
}

export async function unassignSupervisorCustomer(
  accessToken: string,
  customerId: string,
  agentId: string,
): Promise<SupervisorCustomerUnassignAgentResponse> {
  const normalizedCustomerId = customerId.trim()
  const normalizedAgentId = agentId.trim()
  if (!normalizedCustomerId) {
    throw new Error('נדרש מזהה לקוח תקין להסרת שיוך.')
  }
  if (!normalizedAgentId) {
    throw new Error('נדרש מזהה סוכן תקין להסרת שיוך.')
  }

  const response = await requestAgentApi(
    `/v1/supervisor/customers/${encodeURIComponent(normalizedCustomerId)}/assignments/${encodeURIComponent(normalizedAgentId)}`,
    {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )

  return parseValidatedResponse(response, SUPERVISOR_CUSTOMER_UNASSIGN_AGENT_RESPONSE_SCHEMA)
}

export async function updateSupervisorCustomerProfile(
  accessToken: string,
  customerId: string,
  payload: SupervisorCustomerProfileUpdateRequest,
): Promise<SupervisorCustomerProfileUpdateResponse> {
  const response = await requestAgentApi(`/v1/supervisor/customers/${encodeURIComponent(customerId)}/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  return parseValidatedResponse(response, SUPERVISOR_CUSTOMER_PROFILE_UPDATE_RESPONSE_SCHEMA)
}

export async function updateSupervisorAgentAccess(
  accessToken: string,
  agentId: string,
  payload: SupervisorAgentAccessUpdateRequest,
): Promise<SupervisorAgentAccessUpdateResponse> {
  const response = await requestAgentApi(`/v1/supervisor/agents/${encodeURIComponent(agentId)}/access`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  return parseValidatedResponse(response, SUPERVISOR_AGENT_ACCESS_UPDATE_RESPONSE_SCHEMA)
}

export async function forceLogoutSupervisorAgent(
  accessToken: string,
  agentId: string,
  payload: SupervisorAgentForceLogoutRequest = {},
): Promise<SupervisorAgentForceLogoutResponse> {
  const response = await requestAgentApi(`/v1/supervisor/agents/${encodeURIComponent(agentId)}/force-logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  return parseValidatedResponse(response, SUPERVISOR_AGENT_FORCE_LOGOUT_RESPONSE_SCHEMA)
}

export async function bulkReassignSupervisorCustomers(
  accessToken: string,
  payload: SupervisorBulkReassignRequest,
): Promise<SupervisorBulkReassignResponse> {
  const response = await requestAgentApi('/v1/supervisor/customers/bulk-reassign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  return parseValidatedResponse(response, SUPERVISOR_BULK_REASSIGN_RESPONSE_SCHEMA)
}

export async function listSupervisorAuditEntries(
  accessToken: string,
  filters: {
    actorId?: string
    customerId?: string
    eventType?: string
    fromDate?: string
    toDate?: string
    page?: number
    pageSize?: number
  } = {},
): Promise<SupervisorAuditLogResponse> {
  const params = new URLSearchParams()

  if (filters.actorId?.trim()) {
    params.set('actorId', filters.actorId.trim())
  }
  if (filters.customerId?.trim()) {
    params.set('customerId', filters.customerId.trim())
  }
  if (filters.eventType?.trim()) {
    params.set('eventType', filters.eventType.trim())
  }
  if (filters.fromDate?.trim()) {
    params.set('fromDate', filters.fromDate.trim())
  }
  if (filters.toDate?.trim()) {
    params.set('toDate', filters.toDate.trim())
  }
  if (filters.page && filters.page > 0) {
    params.set('page', String(filters.page))
  }
  if (filters.pageSize && filters.pageSize > 0) {
    params.set('pageSize', String(filters.pageSize))
  }

  const querySuffix = params.toString().length > 0 ? `?${params.toString()}` : ''
  const response = await requestAgentApi(`/v1/supervisor/audit${querySuffix}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })

  return parseValidatedResponse(response, SUPERVISOR_AUDIT_LOG_RESPONSE_SCHEMA)
}

export async function getSupervisorOversightSnapshot(accessToken: string): Promise<SupervisorOversightResponse> {
  const response = await requestAgentApi('/v1/supervisor/oversight', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })

  return parseValidatedResponse(response, SUPERVISOR_OVERSIGHT_RESPONSE_SCHEMA)
}
