import { afterEach, describe, expect, it, vi } from 'vitest'

describe('agent customers client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    delete process.env.EXPO_PUBLIC_EXPO_GO_HOST
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
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/agent/customers'),
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer token-42',
        },
      }),
    )
  })

  it('falls back to Expo Go LAN host for customer fetch when localhost is unreachable', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000'
    process.env.EXPO_PUBLIC_EXPO_GO_HOST = '192.168.1.160'
    const { listAssignedCustomers } = await import('../api/agent-customers-client')
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            customers: [],
            total: 0,
            generatedAt: '2026-04-12T19:00:00.000Z',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )

    const result = await listAssignedCustomers('token-42')

    expect(result.total).toBe(0)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/v1/agent/customers',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://192.168.1.160:3000/v1/agent/customers',
      expect.objectContaining({ method: 'GET' }),
    )
    delete process.env.EXPO_PUBLIC_EXPO_GO_HOST
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

  it('generates magic-link payload with expiry metadata for share action', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test'
    const { generateMagicLink } = await import('../api/agent-customers-client')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          linkUrl: 'https://portal.example.test/m?token=abc123',
          expiresAt: '2026-04-07T11:30:00.000Z',
          expiresInSeconds: 5400,
          lifecycle: 'issued',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const response = await generateMagicLink('token-42', 'cust-alpha')

    expect(response).toMatchObject({
      linkUrl: 'https://portal.example.test/m?token=abc123',
      expiresInSeconds: 5400,
      lifecycle: 'issued',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/agent/customers/cust-alpha/magic-links'),
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer token-42',
        },
      }),
    )
  })

  it('loads paginated orders with date/search filters', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test'
    const { listAgentOrders } = await import('../api/agent-customers-client')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          orders: [
            {
              orderId: 'order-1',
              orderRef: 'ORD-1',
              customerId: 'cust-alpha',
              customerName: 'Alpha',
              submittedAt: '2026-04-12T09:00:00.000Z',
              status: 'submitted',
              estimatedTotal: 249.5,
              currency: 'ILS',
              canCancel: true,
              items: [
                {
                  itemId: 'itm-1',
                  itemName: 'Ribeye',
                  quantity: 2,
                  unit: 'kg',
                  lineTotal: 249.5,
                },
              ],
            },
          ],
          page: 2,
          pageSize: 1,
          total: 3,
          totalPages: 3,
          generatedAt: '2026-04-12T09:30:00.000Z',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const response = await listAgentOrders('token-42', {
      page: 2,
      pageSize: 1,
      fromDate: '2026-04-01',
      toDate: '2026-04-30',
      query: 'ribeye',
    })

    expect(response.totalPages).toBe(3)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/agent/orders?page=2&pageSize=1&fromDate=2026-04-01&toDate=2026-04-30&query=ribeye'),
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer token-42',
        },
      }),
    )
  })

  it('cancels an order and returns cancellation metadata', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test'
    const { cancelAgentOrder } = await import('../api/agent-customers-client')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          orderId: 'order-7',
          removed: true,
          status: 'cancelled',
          canceledAt: '2026-04-12T10:00:00.000Z',
          mode: 'testing_local_delete',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const response = await cancelAgentOrder('token-42', 'order-7', 'לקוח ביטל')

    expect(response).toMatchObject({
      orderId: 'order-7',
      status: 'cancelled',
      mode: 'testing_local_delete',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/agent/orders/order-7/cancel'),
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: 'Bearer token-42',
        },
        body: JSON.stringify({
          reason: 'לקוח ביטל',
        }),
      }),
    )
  })

  it('surfaces operator-friendly message when order cancellation target is missing', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test'
    const { listAgentOrders } = await import('../api/agent-customers-client')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Order not found',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    await expect(listAgentOrders('token-42')).rejects.toThrow('Order not found')
  })

  it('rejects cancel order when order ID is blank before making network call', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test'
    const { cancelAgentOrder } = await import('../api/agent-customers-client')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(cancelAgentOrder('token-42', '   ')).rejects.toThrow(
      'נדרש מזהה הזמנה כדי לבטל הזמנה.',
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends cancel order request even when no reason is provided', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test'
    const { cancelAgentOrder } = await import('../api/agent-customers-client')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          orderId: 'order-8',
          removed: true,
          status: 'cancelled',
          canceledAt: '2026-04-12T10:10:00.000Z',
          mode: 'testing_local_delete',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    await cancelAgentOrder('token-42', 'order-8')

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/v1/agent/orders/order-8/cancel'),
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: 'Bearer token-42',
        },
        body: JSON.stringify({}),
      }),
    )
  })
})
