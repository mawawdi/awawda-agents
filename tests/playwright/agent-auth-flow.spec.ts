import { expect, request, test } from 'playwright/test'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { AddressInfo } from 'node:net'

const VALID_CREDENTIALS = {
  phoneOrEmail: 'agent@awawda.local',
  password: 'Password123!',
}

const LOGIN_RESPONSE = {
  accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZ2VudC0wMDEiLCJ0eXBlIjoiYWdlbnRfc2hpZnQifQ.signature',
  expiresIn: 28800,
  agentProfile: {
    id: 'agent-001',
    name: 'Line Agent',
    phone: '+972500000000',
    email: 'agent@awawda.local',
    role: 'field_agent',
  },
}

function createAuthServer() {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'POST' && req.url === '/v1/agent/auth/login') {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk.toString()
      })
      req.on('end', () => {
        const parsed = JSON.parse(body || '{}') as { phoneOrEmail?: string; password?: string }

        if (
          parsed.phoneOrEmail === VALID_CREDENTIALS.phoneOrEmail &&
          parsed.password === VALID_CREDENTIALS.password
        ) {
          res.writeHead(201, { 'content-type': 'application/json' })
          res.end(JSON.stringify(LOGIN_RESPONSE))
          return
        }

        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid credentials' }))
      })
      return
    }

    res.writeHead(404)
    res.end()
  })

  return server
}

test('auth flow baseline: sign-in, session restore simulation, logout clear', async () => {
  const server = createAuthServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))

  const address = server.address() as AddressInfo
  const baseURL = `http://127.0.0.1:${address.port}`

  try {
    const api = await request.newContext({ baseURL })
    const loginResponse = await api.post('/v1/agent/auth/login', {
      data: VALID_CREDENTIALS,
    })

    expect(loginResponse.status()).toBe(201)
    const loginBody = await loginResponse.json()
    expect(loginBody).toEqual(LOGIN_RESPONSE)

    let secureStoreToken: string | null = null

    secureStoreToken = loginBody.accessToken as string
    expect(secureStoreToken?.split('.')).toHaveLength(3)

    const restoredToken = secureStoreToken
    expect(restoredToken).toBe(loginBody.accessToken)

    secureStoreToken = null
    expect(secureStoreToken).toBeNull()

    await api.dispose()
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }
})
