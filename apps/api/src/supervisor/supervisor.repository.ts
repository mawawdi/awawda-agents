import { Injectable } from '@nestjs/common';
import { AgentRole, AuditActorType, CustomerProfileStatus, OrderStatus, Prisma, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import type {
  SupervisorAgentCreateResponse,
  SupervisorAgentAccessUpdateResponse,
  SupervisorAgentForceLogoutResponse,
  SupervisorAgentAssignment,
  SupervisorAgentOverview,
  SupervisorAuditEntry,
  SupervisorBulkReassignResponse,
  SupervisorCustomerOverview,
  SupervisorCustomerProfile,
  SupervisorCustomerProfileUpdateRequest,
  SupervisorCustomerStatus,
  SupervisorOversightActivationFunnel,
  SupervisorOversightErpSignal,
  SupervisorOversightOrdersByAgentEntry,
  SupervisorOversightOrdersByCustomerEntry,
  SupervisorOversightResponse,
} from '@awawda/shared-types';

import {
  SupervisorAgentAlreadyExistsError,
  SupervisorBulkReassignInvalidInputError,
  SupervisorSelfDeactivationForbiddenError,
  SupervisorTargetAgentNotAssignableError,
  SupervisorTargetAgentNotFoundError,
} from './supervisor.errors';
import type {
  SupervisorAuditQueryInput,
  SupervisorAssignCustomerInput,
  SupervisorBulkReassignInput,
  SupervisorCreateAgentInput,
  SupervisorForceLogoutAgentInput,
  SupervisorRepository,
  SupervisorUnassignCustomerInput,
  SupervisorUpdateAgentAccessInput,
  SupervisorUpdateCustomerProfileInput,
} from './supervisor.types';

@Injectable()
export class PrismaSupervisorRepository implements SupervisorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listAgents(): Promise<SupervisorAgentOverview[]> {
    const agents = await this.prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        isActive: true,
        _count: {
          select: {
            assignments: true,
          },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return agents.map((agent) => ({
      agentId: agent.id,
      name: agent.name,
      phone: agent.phone,
      email: agent.email,
      role: toContractAgentRole(agent.role),
      isActive: agent.isActive,
      assignmentCount: agent._count.assignments,
    }));
  }

  async createAgent(input: SupervisorCreateAgentInput): Promise<SupervisorAgentCreateResponse> {
    const name = input.request.name.trim();
    const phone = input.request.phone.trim();
    const email = normalizeOptionalEmail(input.request.email);
    const role = input.request.role === 'supervisor' ? AgentRole.SUPERVISOR : AgentRole.FIELD_AGENT;
    const passwordHash = await argon2.hash(input.request.password);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const createdAgent = await tx.agent.create({
          data: {
            name,
            phone,
            email,
            role,
            isActive: true,
            passwordHash,
          },
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        });

        await tx.auditLog.create({
          data: {
            actorType: AuditActorType.AGENT,
            actorId: input.supervisorAgentId,
            eventType: 'supervisor.agent.created',
            eventPayloadJson: {
              targetAgentId: createdAgent.id,
              role: toContractAgentRole(createdAgent.role),
              email: createdAgent.email,
            },
          },
        });

        return {
          agent: {
            agentId: createdAgent.id,
            name: createdAgent.name,
            phone: createdAgent.phone,
            email: createdAgent.email,
            role: toContractAgentRole(createdAgent.role),
            isActive: createdAgent.isActive,
            assignmentCount: 0,
          },
          createdAt: createdAgent.createdAt.toISOString(),
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target ?? '');
        if (target.includes('email')) {
          throw new SupervisorAgentAlreadyExistsError('email');
        }
        throw new SupervisorAgentAlreadyExistsError('phone');
      }
      throw error;
    }
  }

  async updateAgentAccess(input: SupervisorUpdateAgentAccessInput): Promise<SupervisorAgentAccessUpdateResponse> {
    if (input.supervisorAgentId === input.agentId && input.update.isActive === false) {
      throw new SupervisorSelfDeactivationForbiddenError();
    }

    const current = await this.prisma.agent.findUnique({
      where: {
        id: input.agentId,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        isActive: true,
        updatedAt: true,
        _count: {
          select: {
            assignments: true,
          },
        },
      },
    });

    if (!current) {
      throw new SupervisorTargetAgentNotFoundError(input.agentId);
    }

    const reason = normalizeOptionalReason(input.update.reason);

    return this.prisma.$transaction(async (tx) => {
      const changed = current.isActive !== input.update.isActive;
      const agent = changed
        ? await tx.agent.update({
            where: {
              id: input.agentId,
            },
            data: {
              isActive: input.update.isActive,
            },
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              role: true,
              isActive: true,
              updatedAt: true,
              _count: {
                select: {
                  assignments: true,
                },
              },
            },
          })
        : current;

      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.AGENT,
          actorId: input.supervisorAgentId,
          eventType: 'supervisor.agent_access.updated',
          eventPayloadJson: {
            targetAgentId: input.agentId,
            previousIsActive: current.isActive,
            nextIsActive: input.update.isActive,
            changed,
            reason,
          },
        },
      });

      return {
        agent: {
          agentId: agent.id,
          name: agent.name,
          phone: agent.phone,
          email: agent.email,
          role: toContractAgentRole(agent.role),
          isActive: agent.isActive,
          assignmentCount: agent._count.assignments,
        },
        changed,
        reason,
        updatedAt: agent.updatedAt.toISOString(),
      };
    });
  }

  async forceLogoutAgent(input: SupervisorForceLogoutAgentInput): Promise<SupervisorAgentForceLogoutResponse> {
    const current = await this.prisma.agent.findUnique({
      where: {
        id: input.agentId,
      },
      select: {
        id: true,
      },
    });

    if (!current) {
      throw new SupervisorTargetAgentNotFoundError(input.agentId);
    }

    const reason = normalizeOptionalReason(input.request.reason);

    return this.prisma.$transaction(async (tx) => {
      const agent = await tx.agent.update({
        where: {
          id: input.agentId,
        },
        data: {
          updatedAt: new Date(),
        },
        select: {
          id: true,
          updatedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.AGENT,
          actorId: input.supervisorAgentId,
          eventType: 'supervisor.agent.force_logout',
          eventPayloadJson: {
            targetAgentId: input.agentId,
            reason,
          },
        },
      });

      return {
        agentId: agent.id,
        revoked: true,
        reason,
        revokedAt: agent.updatedAt.toISOString(),
      };
    });
  }

  async bulkReassignCustomers(input: SupervisorBulkReassignInput): Promise<SupervisorBulkReassignResponse> {
    const fromAgentId = input.request.fromAgentId.trim();
    const toAgentId = input.request.toAgentId.trim();
    if (!fromAgentId || !toAgentId || fromAgentId === toAgentId) {
      throw new SupervisorBulkReassignInvalidInputError();
    }

    await Promise.all([this.assertAgentExists(fromAgentId), this.assertAssignableTargetAgent(toAgentId)]);

    const scopedCustomerIds = await this.resolveBulkReassignCustomerScope(fromAgentId, input.request.customerIds);
    if (scopedCustomerIds.length === 0) {
      return {
        fromAgentId,
        toAgentId,
        requestedCustomers: 0,
        reassignedCustomers: 0,
        skippedCustomers: 0,
        createdAssignments: 0,
        removedAssignments: 0,
        processedCustomerIds: [],
        generatedAt: new Date().toISOString(),
      };
    }

    const reason = normalizeOptionalReason(input.request.reason);

    return this.prisma.$transaction(async (tx) => {
      const existingAssignments = await tx.assignment.findMany({
        where: {
          hashCustomerId: {
            in: scopedCustomerIds,
          },
          agentId: {
            in: [fromAgentId, toAgentId],
          },
        },
        select: {
          hashCustomerId: true,
          agentId: true,
        },
      });

      const fromAssigned = new Set(
        existingAssignments
          .filter((assignment) => assignment.agentId === fromAgentId)
          .map((assignment) => assignment.hashCustomerId),
      );
      const toAssigned = new Set(
        existingAssignments
          .filter((assignment) => assignment.agentId === toAgentId)
          .map((assignment) => assignment.hashCustomerId),
      );

      let reassignedCustomers = 0;
      let skippedCustomers = 0;
      let createdAssignments = 0;
      let removedAssignments = 0;
      const processedCustomerIds: string[] = [];

      for (const customerId of scopedCustomerIds) {
        if (!fromAssigned.has(customerId)) {
          skippedCustomers += 1;
          continue;
        }

        if (!toAssigned.has(customerId)) {
          try {
            await tx.assignment.create({
              data: {
                agentId: toAgentId,
                hashCustomerId: customerId,
              },
            });
            createdAssignments += 1;
          } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
              throw error;
            }
          }
        }

        const removed = await tx.assignment.deleteMany({
          where: {
            hashCustomerId: customerId,
            agentId: fromAgentId,
          },
        });

        reassignedCustomers += 1;
        removedAssignments += removed.count;
        processedCustomerIds.push(customerId);
      }

      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.AGENT,
          actorId: input.supervisorAgentId,
          eventType: 'supervisor.customer_assignment.bulk_reassign',
          eventPayloadJson: {
            fromAgentId,
            toAgentId,
            requestedCustomers: scopedCustomerIds.length,
            reassignedCustomers,
            skippedCustomers,
            createdAssignments,
            removedAssignments,
            processedCustomerIds,
            reason,
          },
        },
      });

      return {
        fromAgentId,
        toAgentId,
        requestedCustomers: scopedCustomerIds.length,
        reassignedCustomers,
        skippedCustomers,
        createdAssignments,
        removedAssignments,
        processedCustomerIds,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  async listCustomers(): Promise<SupervisorCustomerOverview[]> {
    const [profiles, assignments] = await Promise.all([
      this.prisma.customerProfile.findMany({
        select: {
          hashCustomerId: true,
          name: true,
          contactName: true,
          phone: true,
          city: true,
          notes: true,
          status: true,
          updatedAt: true,
        },
      }),
      this.prisma.assignment.findMany({
        select: {
          hashCustomerId: true,
          agentId: true,
          createdAt: true,
          id: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);

    const profileByCustomerId = new Map(
      profiles.map((profile) => [
        profile.hashCustomerId,
        {
          customerId: profile.hashCustomerId,
          name: profile.name,
          contactName: profile.contactName,
          phone: profile.phone,
          city: profile.city,
          notes: profile.notes,
          status: toContractCustomerStatus(profile.status),
          updatedAt: profile.updatedAt.toISOString(),
        } satisfies SupervisorCustomerProfile,
      ]),
    );

    const assignmentsByCustomerId = new Map<
      string,
      Array<{ hashCustomerId: string; agentId: string; createdAt: Date }>
    >();

    for (const assignment of assignments) {
      const rows = assignmentsByCustomerId.get(assignment.hashCustomerId);
      if (rows) {
        rows.push(assignment);
      } else {
        assignmentsByCustomerId.set(assignment.hashCustomerId, [assignment]);
      }
    }

    const customerIds = new Set<string>([
      ...profileByCustomerId.keys(),
      ...assignmentsByCustomerId.keys(),
    ]);

    const customers: SupervisorCustomerOverview[] = [];
    for (const customerId of customerIds) {
      const profile = profileByCustomerId.get(customerId);
      const customerAssignments = assignmentsByCustomerId.get(customerId) ?? [];
      const assignedAgentIds = uniqueAssignedAgentIds(customerAssignments);
      const latestAssignmentAt = customerAssignments[0]?.createdAt.toISOString() ?? null;

      customers.push({
        customerId,
        name: profile?.name ?? humanizeCustomerId(customerId),
        contactName: profile?.contactName ?? null,
        phone: profile?.phone ?? null,
        city: profile?.city ?? null,
        notes: profile?.notes ?? null,
        status: profile?.status ?? 'active',
        updatedAt: profile?.updatedAt ?? latestAssignmentAt ?? new Date(0).toISOString(),
        assignment: {
          assignmentCount: customerAssignments.length,
          assignedAgentIds,
          lastAssignedAt: latestAssignmentAt,
        },
      });
    }

    return customers.sort((left, right) => left.name.localeCompare(right.name, 'he'));
  }

  async getOversightSnapshot(): Promise<SupervisorOversightResponse> {
    const now = new Date();
    const windowStart = startOfLocalDay(now);
    const windowEnd = endOfLocalDay(now);
    const dateRangeFilter = {
      gte: windowStart,
      lte: windowEnd,
    } satisfies Prisma.DateTimeFilter;

    const [
      profiles,
      agents,
      assignments,
      todayOrders,
      activationAttempts,
      magicLinksIssued,
      magicLinksActivated,
      sessionsActivated,
      submittedOrders,
    ] = await Promise.all([
      this.prisma.customerProfile.findMany({
        select: {
          hashCustomerId: true,
          name: true,
          contactName: true,
          phone: true,
          city: true,
          notes: true,
          status: true,
          updatedAt: true,
        },
      }),
      this.prisma.agent.findMany({
        select: {
          id: true,
          name: true,
        },
      }),
      this.prisma.assignment.findMany({
        select: {
          hashCustomerId: true,
          agentId: true,
          createdAt: true,
          id: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.order.findMany({
        where: {
          submittedAt: dateRangeFilter,
        },
        select: {
          id: true,
          hashOrderRef: true,
          hashCustomerId: true,
          status: true,
          submittedAt: true,
          estimatedTotal: true,
        },
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.auditLog.findMany({
        where: {
          eventType: 'customer_session.activation_attempt',
          createdAt: dateRangeFilter,
        },
        select: {
          eventPayloadJson: true,
        },
      }),
      this.prisma.magicLink.count({
        where: {
          createdAt: dateRangeFilter,
        },
      }),
      this.prisma.magicLink.count({
        where: {
          activatedAt: dateRangeFilter,
        },
      }),
      this.prisma.session.count({
        where: {
          createdAt: dateRangeFilter,
        },
      }),
      this.prisma.order.count({
        where: {
          submittedAt: dateRangeFilter,
          status: OrderStatus.SUBMITTED,
        },
      }),
    ]);

    const profileByCustomerId = new Map(
      profiles.map((profile) => [
        profile.hashCustomerId,
        {
          name: profile.name,
          contactName: profile.contactName,
          phone: profile.phone,
          city: profile.city,
          notes: profile.notes,
          status: toContractCustomerStatus(profile.status),
          updatedAt: profile.updatedAt.toISOString(),
        },
      ]),
    );
    const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name]));

    const primaryAssignmentByCustomerId = new Map<string, { agentId: string }>();
    const assignmentCountByCustomerId = new Map<string, number>();

    for (const assignment of assignments) {
      assignmentCountByCustomerId.set(
        assignment.hashCustomerId,
        (assignmentCountByCustomerId.get(assignment.hashCustomerId) ?? 0) + 1,
      );

      if (!primaryAssignmentByCustomerId.has(assignment.hashCustomerId)) {
        primaryAssignmentByCustomerId.set(assignment.hashCustomerId, {
          agentId: assignment.agentId,
        });
      }
    }

    const aggregateOrders = createOversightOrdersAccumulator();
    const byAgentMap = new Map<string, SupervisorOversightOrdersByAgentEntry>();
    const byCustomerMap = new Map<string, SupervisorOversightOrdersByCustomerEntry>();
    const latestOrderAtByCustomerId = new Map<string, string>();

    for (const order of todayOrders) {
      const orderStatus = toContractOrderStatus(order.status);
      const estimatedTotal = Number(order.estimatedTotal);
      incrementOversightOrdersAccumulator(aggregateOrders, orderStatus, estimatedTotal);

      const primaryAssignment = primaryAssignmentByCustomerId.get(order.hashCustomerId);
      const assignedAgentId = primaryAssignment?.agentId ?? null;
      const assignedAgentName = assignedAgentId ? agentNameById.get(assignedAgentId) ?? assignedAgentId : null;
      const customerName = profileByCustomerId.get(order.hashCustomerId)?.name ?? humanizeCustomerId(order.hashCustomerId);

      const byAgentKey = assignedAgentId ?? '__unassigned__';
      const byAgentEntry = byAgentMap.get(byAgentKey) ?? {
        agentId: assignedAgentId,
        agentName: assignedAgentName ?? 'ללא שיוך',
        orderCount: 0,
        submittedCount: 0,
        pendingRetryCount: 0,
        failedCount: 0,
        totalAmount: 0,
      };
      incrementOversightOrdersAccumulator(byAgentEntry, orderStatus, estimatedTotal);
      byAgentMap.set(byAgentKey, byAgentEntry);

      const byCustomerEntry = byCustomerMap.get(order.hashCustomerId) ?? {
        customerId: order.hashCustomerId,
        customerName,
        assignedAgentId,
        assignedAgentName,
        orderCount: 0,
        submittedCount: 0,
        pendingRetryCount: 0,
        failedCount: 0,
        totalAmount: 0,
      };
      incrementOversightOrdersAccumulator(byCustomerEntry, orderStatus, estimatedTotal);
      byCustomerMap.set(order.hashCustomerId, byCustomerEntry);

      const submittedAt = order.submittedAt.toISOString();
      const latestSubmittedAt = latestOrderAtByCustomerId.get(order.hashCustomerId);
      if (!latestSubmittedAt || submittedAt > latestSubmittedAt) {
        latestOrderAtByCustomerId.set(order.hashCustomerId, submittedAt);
      }
    }

    const knownCustomerIds = new Set<string>([
      ...profileByCustomerId.keys(),
      ...assignmentCountByCustomerId.keys(),
      ...latestOrderAtByCustomerId.keys(),
    ]);

    const unassignedCustomers: SupervisorCustomerOverview[] = [];
    for (const customerId of knownCustomerIds) {
      const assignmentCount = assignmentCountByCustomerId.get(customerId) ?? 0;
      if (assignmentCount > 0) {
        continue;
      }

      const profile = profileByCustomerId.get(customerId);
      unassignedCustomers.push({
        customerId,
        name: profile?.name ?? humanizeCustomerId(customerId),
        contactName: profile?.contactName ?? null,
        phone: profile?.phone ?? null,
        city: profile?.city ?? null,
        notes: profile?.notes ?? null,
        status: profile?.status ?? 'active',
        updatedAt: profile?.updatedAt ?? latestOrderAtByCustomerId.get(customerId) ?? new Date(0).toISOString(),
        assignment: {
          assignmentCount: 0,
          assignedAgentIds: [],
          lastAssignedAt: null,
        },
      });
    }

    const byAgent = [...byAgentMap.values()].sort((left, right) => {
      if (right.orderCount !== left.orderCount) {
        return right.orderCount - left.orderCount;
      }
      if (right.totalAmount !== left.totalAmount) {
        return right.totalAmount - left.totalAmount;
      }
      return left.agentName.localeCompare(right.agentName, 'he');
    });

    const byCustomer = [...byCustomerMap.values()].sort((left, right) => {
      if (right.orderCount !== left.orderCount) {
        return right.orderCount - left.orderCount;
      }
      if (right.totalAmount !== left.totalAmount) {
        return right.totalAmount - left.totalAmount;
      }
      return left.customerName.localeCompare(right.customerName, 'he');
    });

    const recentErpSignals: SupervisorOversightErpSignal[] = todayOrders
      .filter((order) => order.status === OrderStatus.PENDING_RETRY || order.status === OrderStatus.FAILED)
      .slice(0, 20)
      .map((order) => {
        const primaryAssignment = primaryAssignmentByCustomerId.get(order.hashCustomerId);
        const assignedAgentId = primaryAssignment?.agentId ?? null;
        const assignedAgentName = assignedAgentId ? agentNameById.get(assignedAgentId) ?? assignedAgentId : null;

        return {
          orderId: order.id,
          orderRef: order.hashOrderRef,
          customerId: order.hashCustomerId,
          customerName: profileByCustomerId.get(order.hashCustomerId)?.name ?? humanizeCustomerId(order.hashCustomerId),
          assignedAgentId,
          assignedAgentName,
          status: order.status === OrderStatus.PENDING_RETRY ? 'pending_retry' : 'failed',
          submittedAt: order.submittedAt.toISOString(),
          estimatedTotal: Number(order.estimatedTotal),
        };
      });

    const activationAttemptsCount = activationAttempts.length;
    const activationSuccesses = activationAttempts.reduce((total, entry) => {
      const outcome = resolveActivationAttemptOutcome(entry.eventPayloadJson);
      return outcome === 'success' ? total + 1 : total;
    }, 0);
    const funnel: SupervisorOversightActivationFunnel = {
      magicLinksIssued,
      activationAttempts: activationAttemptsCount,
      activationSuccesses,
      sessionsActivated,
      ordersSubmitted: submittedOrders,
      activationSuccessRate: calculatePercentage(activationSuccesses, activationAttemptsCount),
      linkToSessionConversionRate: calculatePercentage(sessionsActivated, magicLinksIssued),
      sessionToOrderConversionRate: calculatePercentage(submittedOrders, sessionsActivated),
    };

    return {
      window: {
        startAt: windowStart.toISOString(),
        endAt: windowEnd.toISOString(),
        timezone: resolveLocalTimezone(),
      },
      orders: {
        totalOrders: aggregateOrders.orderCount,
        submittedCount: aggregateOrders.submittedCount,
        pendingRetryCount: aggregateOrders.pendingRetryCount,
        failedCount: aggregateOrders.failedCount,
        totalAmount: aggregateOrders.totalAmount,
        byAgent,
        byCustomer,
      },
      unassignedCustomers: {
        total: unassignedCustomers.length,
        customers: unassignedCustomers.sort((left, right) => left.name.localeCompare(right.name, 'he')),
      },
      erp: {
        pendingRetryCount: aggregateOrders.pendingRetryCount,
        failedCount: aggregateOrders.failedCount,
        totalNeedingAttention: aggregateOrders.pendingRetryCount + aggregateOrders.failedCount,
        recentSignals: recentErpSignals,
      },
      funnel,
      generatedAt: now.toISOString(),
    };
  }

  async listCustomerProfiles(): Promise<SupervisorCustomerProfile[]> {
    const profiles = await this.prisma.customerProfile.findMany({
      select: {
        hashCustomerId: true,
        name: true,
        contactName: true,
        phone: true,
        city: true,
        notes: true,
        status: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { hashCustomerId: 'asc' }],
    });

    return profiles.map((profile) => ({
      customerId: profile.hashCustomerId,
      name: profile.name,
      contactName: profile.contactName,
      phone: profile.phone,
      city: profile.city,
      notes: profile.notes,
      status: toContractCustomerStatus(profile.status),
      updatedAt: profile.updatedAt.toISOString(),
    }));
  }

  async listCustomerAssignments(customerId: string): Promise<SupervisorAgentAssignment[]> {
    const assignments = await this.prisma.assignment.findMany({
      where: {
        hashCustomerId: customerId,
      },
      select: {
        hashCustomerId: true,
        agentId: true,
        createdAt: true,
        id: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return assignments.map((assignment) => ({
      customerId: assignment.hashCustomerId,
      agentId: assignment.agentId,
      assignedAt: assignment.createdAt.toISOString(),
    }));
  }

  async listAuditEntries(input: SupervisorAuditQueryInput): Promise<{ entries: SupervisorAuditEntry[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {};

    if (input.actorId?.trim()) {
      where.actorId = input.actorId.trim();
    }

    if (input.eventType?.trim()) {
      where.eventType = {
        contains: input.eventType.trim(),
        mode: 'insensitive',
      };
    }

    const createdAtFilter = buildCreatedAtFilter(input.fromDate, input.toDate);
    if (createdAtFilter) {
      where.createdAt = createdAtFilter;
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        actorType: true,
        actorId: true,
        eventType: true,
        eventPayloadJson: true,
        createdAt: true,
      },
    });

    const customerFilter = input.customerId?.trim() ?? '';
    const filteredRows = customerFilter
      ? rows.filter((row) => matchesCustomerFilter(row.eventPayloadJson, customerFilter))
      : rows;

    const page = input.page > 0 ? input.page : 1;
    const pageSize = input.pageSize > 0 ? input.pageSize : 20;
    const total = filteredRows.length;
    const pagedRows = filteredRows.slice(Math.max(0, (page - 1) * pageSize), Math.max(0, (page - 1) * pageSize) + pageSize);

    return {
      total,
      entries: pagedRows.map((row) => ({
        id: row.id,
        actorType: toContractAuditActorType(row.actorType),
        actorId: row.actorId,
        eventType: row.eventType,
        eventPayload: toJsonRecordOrNull(row.eventPayloadJson),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async assignCustomerToAgent(input: SupervisorAssignCustomerInput): Promise<{
    assignment: SupervisorAgentAssignment;
    created: boolean;
  }> {
    await this.assertAssignableTargetAgent(input.agentId);

    return this.prisma.$transaction(async (tx) => {
      let created = false;
      let assignment = await tx.assignment.findUnique({
        where: {
          agentId_hashCustomerId: {
            agentId: input.agentId,
            hashCustomerId: input.customerId,
          },
        },
        select: {
          hashCustomerId: true,
          agentId: true,
          createdAt: true,
        },
      });

      if (!assignment) {
        try {
          assignment = await tx.assignment.create({
            data: {
              agentId: input.agentId,
              hashCustomerId: input.customerId,
            },
            select: {
              hashCustomerId: true,
              agentId: true,
              createdAt: true,
            },
          });
          created = true;
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
            throw error;
          }

          assignment = await tx.assignment.findUnique({
            where: {
              agentId_hashCustomerId: {
                agentId: input.agentId,
                hashCustomerId: input.customerId,
              },
            },
            select: {
              hashCustomerId: true,
              agentId: true,
              createdAt: true,
            },
          });
        }
      }

      if (!assignment) {
        throw new Error('Supervisor assignment upsert failed to resolve assignment row.');
      }

      const assignmentContract = toAssignmentContract(assignment);

      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.AGENT,
          actorId: input.supervisorAgentId,
          eventType: 'supervisor.customer_assignment.set',
          eventPayloadJson: {
            customerId: input.customerId,
            agentId: input.agentId,
            created,
            assignedAt: assignmentContract.assignedAt,
          },
        },
      });

      return {
        assignment: assignmentContract,
        created,
      };
    });
  }

  async unassignCustomerFromAgent(input: SupervisorUnassignCustomerInput): Promise<{
    removed: boolean;
    removedAt: string;
  }> {
    const removedAt = new Date().toISOString();
    const removed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.assignment.deleteMany({
        where: {
          hashCustomerId: input.customerId,
          agentId: input.agentId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.AGENT,
          actorId: input.supervisorAgentId,
          eventType: 'supervisor.customer_assignment.unset',
          eventPayloadJson: {
            customerId: input.customerId,
            agentId: input.agentId,
            removed: result.count > 0,
            removedAt,
          },
        },
      });

      return result.count > 0;
    });

    return {
      removed,
      removedAt,
    };
  }

  async updateCustomerProfile(input: SupervisorUpdateCustomerProfileInput): Promise<SupervisorCustomerProfile> {
    const previous = await this.prisma.customerProfile.findUnique({
      where: {
        hashCustomerId: input.customerId,
      },
      select: {
        hashCustomerId: true,
        name: true,
        contactName: true,
        phone: true,
        city: true,
        notes: true,
        status: true,
        updatedAt: true,
      },
    });

    const merged = mergeCustomerProfileUpdate(previous, input.customerId, input.update);
    const reason = normalizeOptionalReason(input.update.reason);

    const updated = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.customerProfile.upsert({
        where: {
          hashCustomerId: input.customerId,
        },
        update: {
          name: merged.name,
          contactName: merged.contactName,
          phone: merged.phone,
          city: merged.city,
          notes: merged.notes,
          status: merged.status,
        },
        create: {
          hashCustomerId: input.customerId,
          name: merged.name,
          contactName: merged.contactName,
          phone: merged.phone,
          city: merged.city,
          notes: merged.notes,
          status: merged.status,
        },
        select: {
          hashCustomerId: true,
          name: true,
          contactName: true,
          phone: true,
          city: true,
          notes: true,
          status: true,
          updatedAt: true,
        },
      });

      const before = previous ? toCustomerProfileSnapshot(previous) : null;
      const after = toCustomerProfileSnapshot(profile);

      await tx.auditLog.create({
        data: {
          actorType: AuditActorType.AGENT,
          actorId: input.supervisorAgentId,
          eventType: 'supervisor.customer_profile.updated',
          eventPayloadJson: {
            customerId: input.customerId,
            changedFields: resolveChangedFields(before, after),
            before,
            after,
            reason,
          },
        },
      });

      return profile;
    });

    return {
      customerId: updated.hashCustomerId,
      name: updated.name,
      contactName: updated.contactName,
      phone: updated.phone,
      city: updated.city,
      notes: updated.notes,
      status: toContractCustomerStatus(updated.status),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  private async assertAssignableTargetAgent(agentId: string): Promise<void> {
    const agent = await this.prisma.agent.findUnique({
      where: {
        id: agentId,
      },
      select: {
        id: true,
        role: true,
        isActive: true,
      },
    });

    if (!agent) {
      throw new SupervisorTargetAgentNotFoundError(agentId);
    }

    if (!agent.isActive || agent.role !== AgentRole.FIELD_AGENT) {
      throw new SupervisorTargetAgentNotAssignableError(agentId);
    }
  }

  private async assertAgentExists(agentId: string): Promise<void> {
    const agent = await this.prisma.agent.findUnique({
      where: {
        id: agentId,
      },
      select: {
        id: true,
      },
    });

    if (!agent) {
      throw new SupervisorTargetAgentNotFoundError(agentId);
    }
  }

  private async resolveBulkReassignCustomerScope(fromAgentId: string, customerIds?: string[]): Promise<string[]> {
    if (customerIds && customerIds.length > 0) {
      const normalizedIds = customerIds
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      return [...new Set(normalizedIds)];
    }

    const assignments = await this.prisma.assignment.findMany({
      where: {
        agentId: fromAgentId,
      },
      select: {
        hashCustomerId: true,
      },
    });

    return [...new Set(assignments.map((assignment) => assignment.hashCustomerId))];
  }
}

function toContractAgentRole(role: AgentRole): 'field_agent' | 'supervisor' {
  return role === AgentRole.SUPERVISOR ? 'supervisor' : 'field_agent';
}

function toContractCustomerStatus(status: CustomerProfileStatus): SupervisorCustomerStatus {
  if (status === CustomerProfileStatus.INACTIVE) {
    return 'inactive';
  }
  if (status === CustomerProfileStatus.ON_HOLD) {
    return 'on_hold';
  }
  return 'active';
}

function toContractAuditActorType(actorType: AuditActorType): 'agent' | 'customer_session' | 'system' {
  if (actorType === AuditActorType.CUSTOMER_SESSION) {
    return 'customer_session';
  }
  if (actorType === AuditActorType.SYSTEM) {
    return 'system';
  }
  return 'agent';
}

function toPrismaCustomerStatus(status: SupervisorCustomerStatus): CustomerProfileStatus {
  if (status === 'inactive') {
    return CustomerProfileStatus.INACTIVE;
  }
  if (status === 'on_hold') {
    return CustomerProfileStatus.ON_HOLD;
  }
  return CustomerProfileStatus.ACTIVE;
}

function toJsonRecordOrNull(value: Prisma.JsonValue): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function buildCreatedAtFilter(fromDate?: string, toDate?: string): Prisma.DateTimeFilter | null {
  const from = fromDate ? new Date(fromDate) : null;
  const to = toDate ? new Date(toDate) : null;
  const hasValidFrom = from && !Number.isNaN(from.getTime());
  const hasValidTo = to && !Number.isNaN(to.getTime());

  if (!hasValidFrom && !hasValidTo) {
    return null;
  }

  if (hasValidFrom && hasValidTo) {
    const start = from!;
    const end = to!;
    if (start <= end) {
      return {
        gte: start,
        lte: end,
      };
    }

    return {
      gte: end,
      lte: start,
    };
  }

  if (hasValidFrom) {
    return {
      gte: from!,
    };
  }

  return {
    lte: to!,
  };
}

function matchesCustomerFilter(payload: Prisma.JsonValue, customerId: string): boolean {
  const normalizedCustomerId = customerId.trim().toLowerCase();
  if (!normalizedCustomerId) {
    return true;
  }

  const eventPayload = toJsonRecordOrNull(payload);
  if (!eventPayload) {
    return false;
  }

  const directCustomerId = eventPayload.customerId;
  if (typeof directCustomerId === 'string' && directCustomerId.trim().toLowerCase() === normalizedCustomerId) {
    return true;
  }

  const hashCustomerId = eventPayload.hashCustomerId;
  if (typeof hashCustomerId === 'string' && hashCustomerId.trim().toLowerCase() === normalizedCustomerId) {
    return true;
  }

  return JSON.stringify(eventPayload).toLowerCase().includes(normalizedCustomerId);
}

function normalizeOptionalReason(reason: string | null | undefined): string | null {
  const normalized = reason?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function normalizeOptionalEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

function toAssignmentContract(assignment: {
  hashCustomerId: string;
  agentId: string;
  createdAt: Date;
}): SupervisorAgentAssignment {
  return {
    customerId: assignment.hashCustomerId,
    agentId: assignment.agentId,
    assignedAt: assignment.createdAt.toISOString(),
  };
}

function uniqueAssignedAgentIds(assignments: Array<{ agentId: string }>): string[] {
  const seenAgentIds = new Set<string>();
  const uniqueAgentIds: string[] = [];
  for (const assignment of assignments) {
    if (seenAgentIds.has(assignment.agentId)) {
      continue;
    }
    seenAgentIds.add(assignment.agentId);
    uniqueAgentIds.push(assignment.agentId);
  }
  return uniqueAgentIds;
}

type CustomerProfileAuditSnapshot = {
  customerId: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
  status: SupervisorCustomerStatus;
  updatedAt: string;
};

function resolveChangedFields(
  before: CustomerProfileAuditSnapshot | null,
  after: CustomerProfileAuditSnapshot,
): string[] {
  if (!before) {
    return Object.keys(after);
  }

  const fields: string[] = [];
  for (const key of Object.keys(after) as Array<keyof CustomerProfileAuditSnapshot>) {
    if (before[key] !== after[key]) {
      fields.push(key);
    }
  }
  return fields;
}

function toCustomerProfileSnapshot(profile: {
  hashCustomerId: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
  status: CustomerProfileStatus;
  updatedAt: Date;
}): CustomerProfileAuditSnapshot {
  return {
    customerId: profile.hashCustomerId,
    name: profile.name,
    contactName: profile.contactName,
    phone: profile.phone,
    city: profile.city,
    notes: profile.notes,
    status: toContractCustomerStatus(profile.status),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

function mergeCustomerProfileUpdate(
  previous: {
    name: string;
    contactName: string | null;
    phone: string | null;
    city: string | null;
    notes: string | null;
    status: CustomerProfileStatus;
  } | null,
  customerId: string,
  update: SupervisorCustomerProfileUpdateRequest,
): {
  name: string;
  contactName: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
  status: CustomerProfileStatus;
} {
  const hasName = hasOwnProperty(update, 'name');
  const hasContactName = hasOwnProperty(update, 'contactName');
  const hasPhone = hasOwnProperty(update, 'phone');
  const hasCity = hasOwnProperty(update, 'city');
  const hasNotes = hasOwnProperty(update, 'notes');
  const hasStatus = hasOwnProperty(update, 'status');

  return {
    name: hasName ? update.name ?? humanizeCustomerId(customerId) : previous?.name ?? humanizeCustomerId(customerId),
    contactName: hasContactName ? update.contactName ?? null : previous?.contactName ?? null,
    phone: hasPhone ? update.phone ?? null : previous?.phone ?? null,
    city: hasCity ? update.city ?? null : previous?.city ?? null,
    notes: hasNotes ? update.notes ?? null : previous?.notes ?? null,
    status: hasStatus && update.status ? toPrismaCustomerStatus(update.status) : previous?.status ?? CustomerProfileStatus.ACTIVE,
  };
}

function hasOwnProperty<T extends object>(value: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function humanizeCustomerId(customerId: string): string {
  const normalized = customerId
    .trim()
    .replace(/^cust-/, '')
    .replaceAll('-', ' ')
    .replace(/\s+/g, ' ');

  if (!normalized) {
    return customerId;
  }

  return normalized
    .split(' ')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

type OversightOrdersAccumulator = {
  orderCount: number;
  submittedCount: number;
  pendingRetryCount: number;
  failedCount: number;
  totalAmount: number;
};

function createOversightOrdersAccumulator(): OversightOrdersAccumulator {
  return {
    orderCount: 0,
    submittedCount: 0,
    pendingRetryCount: 0,
    failedCount: 0,
    totalAmount: 0,
  };
}

function incrementOversightOrdersAccumulator(
  target:
    | OversightOrdersAccumulator
    | SupervisorOversightOrdersByAgentEntry
    | SupervisorOversightOrdersByCustomerEntry,
  status: 'submitted' | 'pending_retry' | 'failed',
  totalAmount: number,
): void {
  target.orderCount += 1;
  target.totalAmount += Number.isFinite(totalAmount) ? totalAmount : 0;

  if (status === 'submitted') {
    target.submittedCount += 1;
    return;
  }

  if (status === 'pending_retry') {
    target.pendingRetryCount += 1;
    return;
  }

  target.failedCount += 1;
}

function toContractOrderStatus(status: OrderStatus): 'submitted' | 'pending_retry' | 'failed' {
  if (status === OrderStatus.SUBMITTED) {
    return 'submitted';
  }
  if (status === OrderStatus.PENDING_RETRY) {
    return 'pending_retry';
  }
  return 'failed';
}

function resolveActivationAttemptOutcome(payload: Prisma.JsonValue): 'success' | 'fail' | 'throttled' | null {
  const jsonPayload = toJsonRecordOrNull(payload);
  if (!jsonPayload) {
    return null;
  }

  const outcome = jsonPayload.outcome;
  if (outcome === 'success' || outcome === 'fail' || outcome === 'throttled') {
    return outcome;
  }
  return null;
}

function calculatePercentage(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 1000) / 10;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function resolveLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}
