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
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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
    expect(tx.magicLink.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ml-1',
        status: 'ISSUED',
      },
      data: {
        status: 'ACTIVATED',
        activatedAt: now,
      },
    });
    expect(tx.session.create).toHaveBeenCalled();
    expect(tx.auditLog.createMany).toHaveBeenCalled();
  });

  it('returns invalid when activation token was already transitioned in a concurrent request', async () => {
    const tx = {
      magicLink: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'ml-1',
          hashCustomerId: 'cust-1',
          issuedByAgentId: 'agent-1',
          status: 'ISSUED',
          expiresAt: new Date('2026-04-08T12:00:00.000Z'),
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      session: {
        create: vi.fn(),
      },
      auditLog: {
        createMany: vi.fn(),
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

    expect(result).toEqual({ kind: 'invalid' });
    expect(tx.session.create).not.toHaveBeenCalled();
    expect(tx.auditLog.createMany).not.toHaveBeenCalled();
  });

  it('returns invalid when session create hits unique magic-link constraint race', async () => {
    const tx = {
      magicLink: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'ml-1',
          hashCustomerId: 'cust-1',
          issuedByAgentId: 'agent-1',
          status: 'ISSUED',
          expiresAt: new Date('2026-04-08T12:00:00.000Z'),
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      session: {
        create: vi.fn().mockRejectedValue({ code: 'P2002', meta: { target: ['magic_link_id'] } }),
      },
      auditLog: {
        createMany: vi.fn(),
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

    expect(result).toEqual({ kind: 'invalid' });
    expect(tx.auditLog.createMany).not.toHaveBeenCalled();
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

  it('builds one-year recent orders feed deduped by normalized composition', async () => {
    const now = new Date('2026-04-10T10:00:00.000Z');
    const findMany = vi.fn().mockResolvedValue([
      {
        submittedAt: new Date('2026-04-09T08:00:00.000Z'),
        orderLines: [
          {
            hashItemId: 'Item-1',
            itemNameSnapshot: 'אנטריקוט',
            quantity: { toString: () => '2.000' },
            unit: 'kg',
          },
          {
            hashItemId: 'item-2',
            itemNameSnapshot: 'המבורגר',
            quantity: { toString: () => '3.000' },
            unit: 'kg',
          },
        ],
      },
      {
        submittedAt: new Date('2026-04-08T08:00:00.000Z'),
        orderLines: [
          {
            hashItemId: 'item-2',
            itemNameSnapshot: 'Burger',
            quantity: { toString: () => '3.000' },
            unit: 'kg',
          },
          {
            hashItemId: 'item-1',
            itemNameSnapshot: 'Ribeye',
            quantity: { toString: () => '1.250' },
            unit: 'kg',
          },
          {
            hashItemId: 'item-1',
            itemNameSnapshot: 'Ribeye',
            quantity: { toString: () => '0.750' },
            unit: 'kg',
          },
        ],
      },
      {
        submittedAt: new Date('2026-04-07T08:00:00.000Z'),
        orderLines: [
          {
            hashItemId: 'item-1',
            itemNameSnapshot: 'אנטריקוט',
            quantity: { toString: () => '2.500' },
            unit: 'kg',
          },
          {
            hashItemId: 'item-2',
            itemNameSnapshot: 'המבורגר',
            quantity: { toString: () => '3.000' },
            unit: 'kg',
          },
        ],
      },
    ]);

    const repository = new PrismaCustomerSessionsRepository({
      order: {
        findMany,
      },
    } as never);

    const result = await repository.listRecentOrdersFeed('cust-1', now);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          hashCustomerId: 'cust-1',
          submittedAt: {
            gte: new Date('2025-04-10T10:00:00.000Z'),
            lte: now,
          },
        },
      }),
    );
    expect(result).toEqual({
      entries: [
        {
          compositionSignature: 'item-1:2:kg|item-2:3:kg',
          lines: [
            { itemId: 'item-1', itemName: 'אנטריקוט', quantity: 2, unit: 'kg' },
            { itemId: 'item-2', itemName: 'המבורגר', quantity: 3, unit: 'kg' },
          ],
          lastOrderedAt: '2026-04-09T08:00:00.000Z',
          orderCount: 2,
        },
        {
          compositionSignature: 'item-1:2.5:kg|item-2:3:kg',
          lines: [
            { itemId: 'item-1', itemName: 'אנטריקוט', quantity: 2.5, unit: 'kg' },
            { itemId: 'item-2', itemName: 'המבורגר', quantity: 3, unit: 'kg' },
          ],
          lastOrderedAt: '2026-04-07T08:00:00.000Z',
          orderCount: 1,
        },
      ],
      total: 2,
      pageSize: 12,
      sortBy: 'lastOrderedAt_desc_compositionSignature_asc',
      generatedAt: '2026-04-10T10:00:00.000Z',
      windowStartAt: '2025-04-10T10:00:00.000Z',
    });
  });
});
