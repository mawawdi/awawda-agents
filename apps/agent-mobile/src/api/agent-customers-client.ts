import type {
  AgentApprovedItemMutationResponse,
  AgentApprovedItemsResponse,
  AgentAssignedCustomer,
  AgentCustomersResponse,
} from '@meatland/shared-types'
import { z } from 'zod'

import { API_BASE_URL } from '../config/env'

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
      ? 'Session expired. Please sign in again.'
      : status === 403
        ? 'You are not assigned to this customer yet.'
        : 'Unable to reach Meatland right now. Please try again.'

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
    throw new Error('Unexpected response from server.')
  }

  return parsed.data
}

export async function listAssignedCustomers(accessToken: string): Promise<AgentCustomersResponse> {
  const response = await fetch(`${API_BASE_URL}/v1/agent/customers`, {
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
  const response = await fetch(`${API_BASE_URL}/v1/agent/customers/${encodeURIComponent(customerId)}/approved-items`, {
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
    throw new Error('Enter an item ID before adding.')
  }

  const response = await fetch(`${API_BASE_URL}/v1/agent/customers/${encodeURIComponent(customerId)}/approved-items`, {
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
