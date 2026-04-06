import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('EXPO_PUBLIC_API_BASE_URL', 'http://api.test');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('loginAgent', () => {
  it('returns parsed login payload for successful responses', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        accessToken: 'token-123',
        expiresIn: 3600,
        agentProfile: {
          agentId: 'agent-1',
          name: 'Mona Parker',
          email: 'mona@meatland.test',
        },
      }),
    });

    const { loginAgent } = await import('../api/auth-client');

    await expect(
      loginAgent({
        email: 'mona@meatland.test',
        password: 'Password123!',
      }),
    ).resolves.toEqual({
      accessToken: 'token-123',
      expiresIn: 3600,
      agentProfile: {
        agentId: 'agent-1',
        name: 'Mona Parker',
        email: 'mona@meatland.test',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/v1/agent/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email: 'mona@meatland.test',
        password: 'Password123!',
      }),
    });
  });

  it('surfaces API-provided auth failures for non-2xx responses', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({ message: 'Invalid email or password.' }),
    });

    const { loginAgent } = await import('../api/auth-client');

    await expect(
      loginAgent({
        email: 'wrong@meatland.test',
        password: 'wrong-password',
      }),
    ).rejects.toThrow('Invalid email or password.');
  });

  it('falls back to generic auth message when response body is unavailable', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error('invalid-json')),
    });

    const { loginAgent } = await import('../api/auth-client');

    await expect(
      loginAgent({
        email: 'mona@meatland.test',
        password: 'Password123!',
      }),
    ).rejects.toThrow('Unable to sign in right now. Please try again.');
  });

  it('rejects malformed successful payloads to protect token lifecycle assumptions', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        accessToken: '',
        expiresIn: 3600,
        agentProfile: {
          agentId: 'agent-1',
          name: 'Mona Parker',
          email: 'mona@meatland.test',
        },
      }),
    });

    const { loginAgent } = await import('../api/auth-client');

    await expect(
      loginAgent({
        email: 'mona@meatland.test',
        password: 'Password123!',
      }),
    ).rejects.toThrow('Unexpected response from server.');
  });
});
