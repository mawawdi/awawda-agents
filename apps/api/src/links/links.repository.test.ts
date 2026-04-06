import { describe, expect, it, vi } from 'vitest';

import { PrismaMagicLinksRepository } from './links.repository';

describe('PrismaMagicLinksRepository', () => {
  it('persists only token hash and initializes lifecycle as ISSUED for assigned customers', async () => {
    const tx = {
      assignment: {
        findUnique: vi.fn().mockResolvedValue({
          hashCustomerId: 'cust-1',
        }),
      },
      magicLink: {
        create: vi.fn().mockResolvedValue({
          id: 'ml-1',
          tokenHash: 'hashed-token',
          hashCustomerId: 'cust-1',
          issuedByAgentId: 'agent-1',
          expiresAt: new Date('2026-04-08T12:00:00.000Z'),
          status: 'ISSUED',
        }),
      },
    };

    const prisma = {
      $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
    };

    const repository = new PrismaMagicLinksRepository(prisma as never);
    const result = await repository.issueForAssignedCustomer({
      agentId: 'agent-1',
      customerId: 'cust-1',
      tokenHash: 'hashed-token',
      expiresAt: new Date('2026-04-08T12:00:00.000Z'),
    });

    expect(tx.assignment.findUnique).toHaveBeenCalledWith({
      where: {
        agentId_hashCustomerId: {
          agentId: 'agent-1',
          hashCustomerId: 'cust-1',
        },
      },
      select: {
        hashCustomerId: true,
      },
    });
    expect(tx.magicLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenHash: 'hashed-token',
          hashCustomerId: 'cust-1',
          issuedByAgentId: 'agent-1',
          status: 'ISSUED',
        }),
      }),
    );
    expect(tx.magicLink.create).toHaveBeenCalledWith(
      expect.not.objectContaining({
        data: expect.objectContaining({ token: expect.any(String) }),
      }),
    );
    expect(result).toMatchObject({
      status: 'ISSUED',
      hashCustomerId: 'cust-1',
      issuedByAgentId: 'agent-1',
    });
  });

  it('does not issue magic links when customer is not assigned to agent', async () => {
    const tx = {
      assignment: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      magicLink: {
        create: vi.fn(),
      },
    };

    const prisma = {
      $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
    };

    const repository = new PrismaMagicLinksRepository(prisma as never);
    const result = await repository.issueForAssignedCustomer({
      agentId: 'agent-2',
      customerId: 'cust-2',
      tokenHash: 'hashed-token',
      expiresAt: new Date('2026-04-08T12:00:00.000Z'),
    });

    expect(result).toBeNull();
    expect(tx.magicLink.create).not.toHaveBeenCalled();
  });
});
