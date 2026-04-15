import { afterEach, describe, expect, it, vi } from 'vitest'

describe('auth client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('posts login payload and returns parsed auth response', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test'
    const { loginAgent } = await import('../api/auth-client')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'token-123',
          expiresIn: 28800,
          agentProfile: {
            id: 'agent-1',
            name: 'Line Agent',
            phone: '+972500000000',
            email: 'agent@example.test',
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const result = await loginAgent({
      phoneOrEmail: 'agent@example.test',
      password: 'Password123',
    })

    expect(result.accessToken).toBe('token-123')
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/v1/agent/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        phoneOrEmail: 'agent@example.test',
        password: 'Password123',
      }),
      signal: expect.any(AbortSignal),
    })
  })

  it('normalizes placeholder API base URL to localhost defaults', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://YOUR_LAN_IP:3000'
    const { loginAgent } = await import('../api/auth-client')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'token-local-default',
          expiresIn: 28800,
          agentProfile: {
            id: 'agent-1',
            name: 'Line Agent',
            phone: '+972500000000',
            email: 'agent@example.test',
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const result = await loginAgent({
      phoneOrEmail: 'agent@example.test',
      password: 'Password123',
    })

    expect(result.accessToken).toBe('token-local-default')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/v1/agent/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        phoneOrEmail: 'agent@example.test',
        password: 'Password123',
      }),
      signal: expect.any(AbortSignal),
    })
  })

  it('shows timeout guidance for slow network path', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test'
    const { loginAgent } = await import('../api/auth-client')
    const abortError = new Error('Request timed out')
    abortError.name = 'AbortError'
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError)

    await expect(
      loginAgent({
        phoneOrEmail: 'agent@example.test',
        password: 'Password123',
      }),
    ).rejects.toThrow('לא ניתן להגיע אל שרת ההתחברות')
  })

  it('falls back to localhost when configured LAN IP is unreachable', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://10.0.0.25:3000'
    const { loginAgent } = await import('../api/auth-client')
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'token-abc',
            expiresIn: 28800,
            agentProfile: {
              id: 'agent-1',
              name: 'Line Agent',
              phone: '+972500000000',
              email: 'agent@example.test',
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    const result = await loginAgent({
      phoneOrEmail: 'agent@example.test',
      password: 'Password123',
    })

    expect(result.accessToken).toBe('token-abc')
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://10.0.0.25:3000/v1/agent/auth/login',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/v1/agent/auth/login',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('falls back when an API candidate responds with method-route mismatch', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://10.0.0.25:3000'
    const { loginAgent } = await import('../api/auth-client')
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Cannot GET /v1/agent/auth/login' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'token-route-fallback',
            expiresIn: 28800,
            agentProfile: {
              id: 'agent-1',
              name: 'Line Agent',
              phone: '+972500000000',
              email: 'agent@example.test',
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    const result = await loginAgent({
      phoneOrEmail: 'agent@example.test',
      password: 'Password123',
    })

    expect(result.accessToken).toBe('token-route-fallback')
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://10.0.0.25:3000/v1/agent/auth/login',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/v1/agent/auth/login',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('uses Expo Go bundle host as fallback when localhost is unreachable', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000'
    process.env.EXPO_PUBLIC_EXPO_GO_HOST = '192.168.1.77'
    const { loginAgent } = await import('../api/auth-client')
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'token-expogo',
            expiresIn: 28800,
            agentProfile: {
              id: 'agent-1',
              name: 'Expo Agent',
              phone: '+972500000000',
              email: 'agent@example.test',
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    const result = await loginAgent({
      phoneOrEmail: 'agent@example.test',
      password: 'Password123',
    })

    expect(result.accessToken).toBe('token-expogo')
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/v1/agent/auth/login',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://192.168.1.77:3000/v1/agent/auth/login',
      expect.objectContaining({ method: 'POST' }),
    )
    delete process.env.EXPO_PUBLIC_EXPO_GO_HOST
  })

  it('keeps invalid-credentials message for 401 responses', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test'
    const { loginAgent } = await import('../api/auth-client')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(
      loginAgent({
        phoneOrEmail: 'agent@example.test',
        password: 'Password123',
      }),
    ).rejects.toThrow('Invalid credentials')
  })

  it('normalizes common Android emulator typo host and reaches 10.0.2.2', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://10.0.0.2.2:3000'
    const { loginAgent } = await import('../api/auth-client')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'token-typo-fixed',
          expiresIn: 28800,
          agentProfile: {
            id: 'agent-1',
            name: 'Line Agent',
            phone: '+972500000000',
            email: 'agent@example.test',
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const result = await loginAgent({
      phoneOrEmail: 'agent@example.test',
      password: 'Password123',
    })

    expect(result.accessToken).toBe('token-typo-fixed')
    expect(fetchMock).toHaveBeenCalledWith('http://10.0.2.2:3000/v1/agent/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        phoneOrEmail: 'agent@example.test',
        password: 'Password123',
      }),
      signal: expect.any(AbortSignal),
    })
  })
})
