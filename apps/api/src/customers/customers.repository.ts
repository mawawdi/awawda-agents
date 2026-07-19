import { Injectable } from '@nestjs/common';
import { AuditActorType, Prisma, PrismaClient } from '@prisma/client';
import type { AgentApprovedItem, AgentAssignedCustomer } from '@awawda/shared-types';

import type { AgentCustomersRepository } from './customers.types';

@Injectable()
export class PrismaAgentCustomersRepository implements AgentCustomersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listAssignedCustomers(agentId: string): Promise<AgentAssignedCustomer[]> {
    const assignments = await this.prisma.assignment.findMany({
      where: {
        agentId,
      },
      select: {
        hashCustomerId: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const customerIds = [...new Set(assignments.map((assignment) => assignment.hashCustomerId))];

    if (customerIds.length === 0) {
      return [];
    }

    const [approvedCounts, lastOrders] = await Promise.all([
      this.prisma.approvedItem.groupBy({
        by: ['hashCustomerId'],
        where: {
          hashCustomerId: {
            in: customerIds,
          },
        },
        _count: {
          _all: true,
        },
      }),
      this.prisma.order.groupBy({
        by: ['hashCustomerId'],
        where: {
          hashCustomerId: {
            in: customerIds,
          },
        },
        _max: {
          submittedAt: true,
        },
      }),
    ]);

    const approvedCountByCustomer = new Map(
      approvedCounts.map((result) => [result.hashCustomerId, result._count._all]),
    );
    const lastOrderByCustomer = new Map(
      lastOrders.map((result) => [result.hashCustomerId, result._max.submittedAt]),
    );

    return customerIds.map((customerId) => ({
      customerId,
      approvedItemsCount: approvedCountByCustomer.get(customerId) ?? 0,
      lastOrderAt: lastOrderByCustomer.get(customerId)?.toISOString() ?? null,
    }));
  }

  async isAgentAssignedToCustomer(agentId: string, customerId: string): Promise<boolean> {
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        agentId,
        hashCustomerId: customerId,
      },
      select: {
        id: true,
      },
    });

    return assignment !== null;
  }

  async listApprovedItems(customerId: string): Promise<AgentApprovedItem[]> {
    const approvedItems = await this.prisma.approvedItem.findMany({
      where: {
        hashCustomerId: customerId,
      },
      select: {
        hashItemId: true,
        addedByAgentId: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return approvedItems.map((item) => ({
      hashItemId: item.hashItemId,
      addedByAgentId: item.addedByAgentId,
      createdAt: item.createdAt.toISOString(),
    }));
  }

  async addApprovedItem(
    customerId: string,
    hashItemId: string,
    agentId: string,
  ): Promise<{ item: AgentApprovedItem; created: boolean }> {
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const approvedItem = await tx.approvedItem.create({
          data: {
            hashCustomerId: customerId,
            hashItemId,
            addedByAgentId: agentId,
          },
          select: {
            id: true,
            hashItemId: true,
            addedByAgentId: true,
            createdAt: true,
          },
        });

        await tx.auditLog.create({
          data: {
            actorType: AuditActorType.AGENT,
            actorId: agentId,
            eventType: 'approved_item.added',
            eventPayloadJson: {
              approvedItemId: approvedItem.id,
              customerId,
              hashItemId,
            },
          },
        });

        return approvedItem;
      });

      return {
        item: {
          hashItemId: created.hashItemId,
          addedByAgentId: created.addedByAgentId,
          createdAt: created.createdAt.toISOString(),
        },
        created: true,
      };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
    }

    const existing = await this.prisma.approvedItem.findUnique({
      where: {
        hashCustomerId_hashItemId: {
          hashCustomerId: customerId,
          hashItemId,
        },
      },
      select: {
        hashItemId: true,
        addedByAgentId: true,
        createdAt: true,
      },
    });

    if (!existing) {
      throw new Error('Approved item conflict detected but item record was not found');
    }

    return {
      item: {
        hashItemId: existing.hashItemId,
        addedByAgentId: existing.addedByAgentId,
        createdAt: existing.createdAt.toISOString(),
      },
      created: false,
    };
  }

  async removeApprovedItem(
    customerId: string,
    hashItemId: string,
    agentId: string,
  ): Promise<{ removed: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.approvedItem.findUnique({
        where: {
          hashCustomerId_hashItemId: {
            hashCustomerId: customerId,
            hashItemId,
          },
        },
        select: { id: true },
      });

      // Atomic conditional delete: deleteMany does not throw when the row is already gone (e.g. a
      // double-click firing two concurrent removals), so the loser returns an idempotent
      // { removed: false } instead of an unhandled Prisma P2025 -> HTTP 500.
      const deleted = await tx.approvedItem.deleteMany({
        where: {
          hashCustomerId: customerId,
          hashItemId,
        },
      });

      if (deleted.count === 0) {
        return { removed: false };
      }

      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.AGENT,
          actorId: agentId,
          eventType: 'approved_item.removed',
          eventPayloadJson: {
            approvedItemId: existing?.id ?? null,
            customerId,
            hashItemId,
          },
        },
      });

      return { removed: true };
    });
  }
}
