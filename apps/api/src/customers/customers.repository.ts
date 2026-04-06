import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { AgentAssignedCustomer } from '@meatland/shared-types';

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
}
