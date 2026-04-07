import { describe, expect, it, vi } from 'vitest';

import { PrismaCustomerSessionsRepository } from './sessions.repository';

describe('PrismaCustomerSessionsRepository', () => {
  it('activates issued non-expired token and writes audit trail + session', async () => {
    const now = new Date('2026-04-08T10:00:00.000Z');
    const tx = {
      magicLink: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'ml-1',
          hashCustomerId: 'cust-1',
          issuedByAgentId: 'agent-1',
          status: 'ISSUED',
          expiresAt: new Date('2026-04-08T12:00:00.000Z'),
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      session: {
        create: vi.fn().mockResolvedValue({
          id: 'sess-1',
          hashCustomerId: 'cust-1',
          sessionExpiresAt: new Date('2026-04-08T14:00:00.000Z'),
        }),
      },
      auditLog: {
        createMany: vi.fn().mockResolvedValue(undefined),
      },
    };

    const repository = new PrismaCustomerSessionsRepository({
      $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
    } as never);

    const result = await repository.activateMagicToken(
      'hashed-token',
      now,
      new Date('2026-04-08T14:00:00.000Z'),
    );

    expect(result).toEqual({
      kind: 'activated',
      sessionId: 'sess-1',
      customerId: 'cust-1',
      sessionExpiresAt: new Date('2026-04-08T14:00:00.000Z'),
    });
    expect(tx.magicLink.update).toHaveBeenCalledWith({
      where: {
        id: 'ml-1',
      },
      data: {
        status: 'ACTIVATED',
        activatedAt: now,
      },
    });
    expect(tx.session.create).toHaveBeenCalled();
    expect(tx.auditLog.createMany).toHaveBeenCalled();
  });

  it('marks issued expired token as expired and returns explicit expired result', async () => {
    const tx = {
      magicLink: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'ml-1',
          hashCustomerId: 'cust-1',
          issuedByAgentId: 'agent-1',
          status: 'ISSUED',
          expiresAt: new Date('2026-04-08T09:00:00.000Z'),
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue(undefined),
      },
    };

    const repository = new PrismaCustomerSessionsRepository({
      $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
    } as never);

    const result = await repository.activateMagicToken(
      'hashed-token',
      new Date('2026-04-08T10:00:00.000Z'),
      new Date('2026-04-08T14:00:00.000Z'),
    );

    expect(result).toEqual({ kind: 'expired' });
    expect(tx.magicLink.update).toHaveBeenCalledWith({
      where: {
        id: 'ml-1',
      },
      data: {
        status: 'EXPIRED',
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'magic_link.expired',
        }),
      }),
    );
  });

  it('transitions active but elapsed customer session to expired with audit', async () => {
    const tx = {
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sess-1',
          hashCustomerId: 'cust-1',
          sessionExpiresAt: new Date('2026-04-08T09:00:00.000Z'),
          status: 'ACTIVE',
          isActive: true,
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue(undefined),
      },
    };

    const repository = new PrismaCustomerSessionsRepository({
      $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
    } as never);

    const result = await repository.validateCustomerSession(
      'sess-1',
      'cust-1',
      new Date('2026-04-08T10:00:00.000Z'),
    );

    expect(result).toEqual({ kind: 'expired' });
    expect(tx.session.update).toHaveBeenCalledWith({
      where: {
        id: 'sess-1',
      },
      data: {
        status: 'EXPIRED',
        isActive: false,
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'customer_session.expired',
        }),
      }),
    );
  });

  it('closes active session on explicit logout request', async () => {
    const now = new Date('2026-04-08T10:00:00.000Z');
    const tx = {
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sess-1',
          hashCustomerId: 'cust-1',
          status: 'ACTIVE',
          isActive: true,
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue(undefined),
      },
    };

    const repository = new PrismaCustomerSessionsRepository({
      $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
    } as never);

    await repository.deactivateCustomerSession('sess-1', 'cust-1', now);

    expect(tx.session.update).toHaveBeenCalledWith({
      where: {
        id: 'sess-1',
      },
      data: {
        status: 'CLOSED',
        isActive: false,
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'customer_session.closed',
        }),
      }),
    );
  });
});
