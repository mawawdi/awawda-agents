import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaRefreshTokenRepository } from './auth.repository';

function makePrismaMock() {
  const refreshToken = {
    create: vi.fn().mockResolvedValue(undefined),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  };

  const prisma = {
    refreshToken,
    $transaction: vi.fn(async (cb: (tx: typeof prisma) => unknown) => cb(prisma)),
  };

  return prisma;
}

describe('PrismaRefreshTokenRepository', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let repo: PrismaRefreshTokenRepository;

  beforeEach(() => {
    prisma = makePrismaMock();
    repo = new PrismaRefreshTokenRepository(prisma as never);
    vi.clearAllMocks();
  });

  describe('createRefreshToken', () => {
    it('creates a new refresh token record', async () => {
      prisma.refreshToken.create.mockResolvedValue(undefined);
      const expiresAt = new Date('2026-06-01T00:00:00.000Z');

      await repo.createRefreshToken('agent-1', 'hash-abc', expiresAt);

      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: { agentId: 'agent-1', tokenHash: 'hash-abc', expiresAt },
      });
    });
  });

  describe('revokeRefreshToken', () => {
    it('marks an active token as revoked', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await repo.revokeRefreshToken('hash-to-revoke');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: 'hash-to-revoke', revokedAt: null },
        }),
      );
    });

    it('is idempotent when token is already revoked', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(repo.revokeRefreshToken('already-revoked-hash')).resolves.not.toThrow();
    });
  });

  describe('rotateRefreshToken', () => {
    it('returns agentId and tokenCreatedAt on successful rotation', async () => {
      const createdAt = new Date('2026-05-01T10:00:00.000Z');
      const newExpiresAt = new Date('2026-06-01T10:00:00.000Z');

      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.findUnique.mockResolvedValue({
        agentId: 'agent-7',
        tokenHash: 'old-hash',
        createdAt,
        expiresAt: new Date('2026-06-01T00:00:00.000Z'),
        revokedAt: null,
      });
      prisma.refreshToken.create.mockResolvedValue(undefined);

      const result = await repo.rotateRefreshToken('old-hash', 'new-hash', newExpiresAt);

      expect(result).toEqual({ agentId: 'agent-7', tokenCreatedAt: createdAt });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ agentId: 'agent-7', tokenHash: 'new-hash' }),
        }),
      );
    });

    it('returns null when token is already revoked or expired (updateMany count === 0)', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      const result = await repo.rotateRefreshToken(
        'revoked-hash',
        'new-hash',
        new Date('2026-06-01T00:00:00.000Z'),
      );

      expect(result).toBeNull();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('returns null when token record cannot be found after revoke', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      const result = await repo.rotateRefreshToken(
        'ghost-hash',
        'new-hash',
        new Date('2026-06-01T00:00:00.000Z'),
      );

      expect(result).toBeNull();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });
});
