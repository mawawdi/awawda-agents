import { expect, request, test } from 'playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

const API_ORIGIN = 'http://127.0.0.1:3301';

let apiProcess: ChildProcessWithoutNullStreams;

async function waitForApiReadiness(timeoutMs = 30_000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${API_ORIGIN}/v1/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // retry until timeout
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('API did not become ready in time for Playwright baseline flow.');
}

test.beforeAll(async () => {
  apiProcess = spawn(
    'pnpm',
    ['--filter', '@meatland/api', 'dev'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: '3301',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  apiProcess.stderr.on('data', () => {
    // keep stream drained to avoid blocking
  });
  apiProcess.stdout.on('data', () => {
    // keep stream drained to avoid blocking
  });

  await waitForApiReadiness();
});

test.afterAll(async () => {
  if (apiProcess.pid) {
    apiProcess.kill('SIGTERM');
  }
});

test('baseline auth flow: sign-in, persisted session restore, logout clear', async () => {
  const loginContext = await request.newContext({ baseURL: API_ORIGIN });

  const loginResponse = await loginContext.post('/v1/agent/auth/login', {
    data: {
      email: 'agent@meatland.local',
      password: 'Password123!',
    },
  });

  expect(loginResponse.status()).toBe(201);
  const loginBody = await loginResponse.json();
  expect(loginBody).toEqual(
    expect.objectContaining({
      accessToken: expect.any(String),
      expiresIn: expect.any(Number),
      agentProfile: expect.objectContaining({
        agentId: 'agent-001',
        email: 'agent@meatland.local',
      }),
    }),
  );

  const persistedToken = loginBody.accessToken as string;
  await loginContext.dispose();

  const restoreContext = await request.newContext({
    baseURL: API_ORIGIN,
    extraHTTPHeaders: {
      authorization: `Bearer ${persistedToken}`,
    },
  });

  const sessionResponse = await restoreContext.get('/v1/agent/auth/session');
  expect(sessionResponse.status()).toBe(200);
  await expect(sessionResponse.json()).resolves.toEqual(
    expect.objectContaining({
      agentProfile: expect.objectContaining({
        agentId: 'agent-001',
        email: 'agent@meatland.local',
      }),
    }),
  );

  const logoutResponse = await restoreContext.post('/v1/agent/auth/logout');
  expect(logoutResponse.status()).toBe(201);
  await expect(logoutResponse.json()).resolves.toEqual({ success: true });

  const invalidatedResponse = await restoreContext.get('/v1/agent/auth/session');
  expect(invalidatedResponse.status()).toBe(401);

  await restoreContext.dispose();
});
