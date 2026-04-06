import { afterEach, describe, expect, it, vi } from 'vitest'

describe('agent customers client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads assigned customers with authorized contract headers', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test'
    const { listAssignedCustomers } = await import('../api/agent-customers-client')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          customers: [
            {
              customerId: 'cust-alpha',
              approvedItemsCount: 2,
              lastOrderAt: '2026-04-06T18:45:00.000Z',
            },
          ],
          total: 1,
          generatedAt: '2026-04-06T19:00:00.000Z',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const result = await listAssignedCustomers('token-42')

    expect(result.total).toBe(1)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/v1/agent/customers'), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer token-42',
      },
    })
  })

  it('supports duplicate-safe add-item responses and trims field input', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test'
    const { addApprovedItem } = await import('../api/agent-customers-client')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          customerId: 'cust-alpha',
          created: false,
          item: {
            hashItemId: 'itm-11',
            addedByAgentId: 'agent-7',
            createdAt: '2026-04-05T10:00:00.000Z',
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const response = await addApprovedItem('token-42', 'cust-alpha', '  itm-11  ')

    expect(response).toMatchObject({
      customerId: 'cust-alpha',
      created: false,
      item: {
        hashItemId: 'itm-11',
      },
    })
  })

  it('returns operator-friendly message for slow/failing network permissions path', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test'
    const { addApprovedItem } = await import('../api/agent-customers-client')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Agent is not assigned to this customer',
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    await expect(addApprovedItem('token-42', 'cust-locked', 'itm-11')).rejects.toThrow(
      'Agent is not assigned to this customer',
    )
  })
})
