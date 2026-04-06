import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStoreMock = {
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
};

vi.mock('expo-secure-store', () => secureStoreMock);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('session storage', () => {
  it('reads persisted agent tokens using the stable key', async () => {
    secureStoreMock.getItemAsync.mockResolvedValue('saved-token');

    const { readSessionToken } = await import('../session/session-storage');

    await expect(readSessionToken()).resolves.toBe('saved-token');
    expect(secureStoreMock.getItemAsync).toHaveBeenCalledWith('meatland.agent.access-token');
  });

  it('persists access tokens for session restore', async () => {
    const { persistSessionToken } = await import('../session/session-storage');

    await persistSessionToken('next-token');

    expect(secureStoreMock.setItemAsync).toHaveBeenCalledWith('meatland.agent.access-token', 'next-token');
  });

  it('clears access tokens on sign-out', async () => {
    const { clearSessionToken } = await import('../session/session-storage');

    await clearSessionToken();

    expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith('meatland.agent.access-token');
  });
});
