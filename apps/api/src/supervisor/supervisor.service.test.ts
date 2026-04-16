import { describe, expect, it, vi } from 'vitest';

import { SupervisorService } from './supervisor.service';
import type { SupervisorRepository } from './supervisor.types';

describe('SupervisorService', () => {
  it('returns generated agent list metadata', async () => {
    const repository = createRepositoryMock({
      listAgents: vi.fn().mockResolvedValue([
        {
          agentId: 'agent-1',
          name: 'Field Agent',
          phone: '+972500000000',
          email: 'field@example.com',
          role: 'field_agent',
          isActive: true,
          assignmentCount: 3,
        },
      ]),
    });
    const service = new SupervisorService(repository);

    const response = await service.listAgents();

    expect(response).toMatchObject({
      total: 1,
      agents: [
        {
          agentId: 'agent-1',
          role: 'field_agent',
          assignmentCount: 3,
        },
      ],
    });
    expect(typeof response.generatedAt).toBe('string');
  });

  it('forwards supervisor oversight dashboard snapshots', async () => {
    const repository = createRepositoryMock({
      getOversightSnapshot: vi.fn().mockResolvedValue({
        window: {
          startAt: '2026-04-16T00:00:00.000Z',
          endAt: '2026-04-16T23:59:59.999Z',
          timezone: 'Asia/Jerusalem',
        },
        orders: {
          totalOrders: 3,
          submittedCount: 2,
          pendingRetryCount: 1,
          failedCount: 0,
          totalAmount: 1850,
          byAgent: [
            {
              agentId: 'agent-1',
              agentName: 'Parpar',
              orderCount: 3,
              submittedCount: 2,
              pendingRetryCount: 1,
              failedCount: 0,
              totalAmount: 1850,
            },
          ],
          byCustomer: [
            {
              customerId: 'cust-a',
              customerName: 'לקוח א',
              assignedAgentId: 'agent-1',
              assignedAgentName: 'Parpar',
              orderCount: 2,
              submittedCount: 1,
              pendingRetryCount: 1,
              failedCount: 0,
              totalAmount: 1200,
            },
          ],
        },
        unassignedCustomers: {
          total: 1,
          customers: [
            {
              customerId: 'cust-unassigned',
              name: 'לקוח ללא שיוך',
              contactName: null,
              phone: null,
              city: null,
              notes: null,
              status: 'active',
              updatedAt: '2026-04-16T07:00:00.000Z',
              assignment: {
                assignmentCount: 0,
                assignedAgentIds: [],
                lastAssignedAt: null,
              },
            },
          ],
        },
        erp: {
          pendingRetryCount: 1,
          failedCount: 0,
          totalNeedingAttention: 1,
          recentSignals: [
            {
              orderId: 'order-1',
              orderRef: 'hash-123',
              customerId: 'cust-a',
              customerName: 'לקוח א',
              assignedAgentId: 'agent-1',
              assignedAgentName: 'Parpar',
              status: 'pending_retry',
              submittedAt: '2026-04-16T08:00:00.000Z',
              estimatedTotal: 640,
            },
          ],
        },
        funnel: {
          magicLinksIssued: 5,
          activationAttempts: 4,
          activationSuccesses: 3,
          sessionsActivated: 3,
          ordersSubmitted: 2,
          activationSuccessRate: 75,
          linkToSessionConversionRate: 60,
          sessionToOrderConversionRate: 66.7,
        },
        generatedAt: '2026-04-16T12:45:00.000Z',
      }),
    });
    const service = new SupervisorService(repository);

    const response = await service.getOversightSnapshot();

    expect(response.orders.totalOrders).toBe(3);
    expect(response.erp.totalNeedingAttention).toBe(1);
    expect(response.funnel.activationSuccessRate).toBe(75);
    expect(repository.getOversightSnapshot).toHaveBeenCalledWith();
  });

  it('forwards agent access, bulk reassignment, and audit queries', async () => {
    const repository = createRepositoryMock({
      updateAgentAccess: vi.fn().mockResolvedValue({
        agent: {
          agentId: 'agent-2',
          name: 'Agent Two',
          phone: '+972500000002',
          email: null,
          role: 'field_agent',
          isActive: false,
          assignmentCount: 3,
        },
        changed: true,
        reason: 'Vacation',
        updatedAt: '2026-04-16T12:00:00.000Z',
      }),
      bulkReassignCustomers: vi.fn().mockResolvedValue({
        fromAgentId: 'agent-1',
        toAgentId: 'agent-2',
        requestedCustomers: 2,
        reassignedCustomers: 2,
        skippedCustomers: 0,
        createdAssignments: 1,
        removedAssignments: 2,
        processedCustomerIds: ['cust-a', 'cust-b'],
        generatedAt: '2026-04-16T12:10:00.000Z',
      }),
      listAuditEntries: vi.fn().mockResolvedValue({
        total: 1,
        entries: [
          {
            id: 'audit-1',
            actorType: 'agent',
            actorId: 'supervisor-1',
            eventType: 'supervisor.customer_profile.updated',
            eventPayload: { customerId: 'cust-a' },
            createdAt: '2026-04-16T12:20:00.000Z',
          },
        ],
      }),
    });
    const service = new SupervisorService(repository);

    const access = await service.updateAgentAccess('supervisor-1', 'agent-2', {
      isActive: false,
      reason: 'Vacation',
    });
    const bulk = await service.bulkReassignCustomers('supervisor-1', {
      fromAgentId: 'agent-1',
      toAgentId: 'agent-2',
      customerIds: ['cust-a', 'cust-b'],
    });
    const audit = await service.listAuditEntries({ page: 2, pageSize: 10, customerId: 'cust-a' });

    expect(access.changed).toBe(true);
    expect(bulk.reassignedCustomers).toBe(2);
    expect(audit).toMatchObject({
      page: 2,
      pageSize: 10,
      total: 1,
      totalPages: 1,
      entries: [
        {
          id: 'audit-1',
          actorType: 'agent',
        },
      ],
    });
    expect(repository.updateAgentAccess).toHaveBeenCalledWith({
      supervisorAgentId: 'supervisor-1',
      agentId: 'agent-2',
      update: {
        isActive: false,
        reason: 'Vacation',
      },
    });
    expect(repository.bulkReassignCustomers).toHaveBeenCalledWith({
      supervisorAgentId: 'supervisor-1',
      request: {
        fromAgentId: 'agent-1',
        toAgentId: 'agent-2',
        customerIds: ['cust-a', 'cust-b'],
      },
    });
    expect(repository.listAuditEntries).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      customerId: 'cust-a',
    });
  });

  it('forwards supervisor agent creation requests', async () => {
    const repository = createRepositoryMock({
      createAgent: vi.fn().mockResolvedValue({
        agent: {
          agentId: 'agent-new-1',
          name: 'Agent New',
          phone: '+972500000099',
          email: 'agent.new@awawda.test',
          role: 'field_agent',
          isActive: true,
          assignmentCount: 0,
        },
        createdAt: '2026-04-16T12:25:00.000Z',
      }),
    });
    const service = new SupervisorService(repository);

    const response = await service.createAgent('agent-supervisor-1', {
      name: 'Agent New',
      phone: '+972500000099',
      email: 'agent.new@awawda.test',
      password: 'Password123!',
      role: 'field_agent',
    });

    expect(response).toEqual({
      agent: {
        agentId: 'agent-new-1',
        name: 'Agent New',
        phone: '+972500000099',
        email: 'agent.new@awawda.test',
        role: 'field_agent',
        isActive: true,
        assignmentCount: 0,
      },
      createdAt: '2026-04-16T12:25:00.000Z',
    });
    expect(repository.createAgent).toHaveBeenCalledWith({
      supervisorAgentId: 'agent-supervisor-1',
      request: {
        name: 'Agent New',
        phone: '+972500000099',
        email: 'agent.new@awawda.test',
        password: 'Password123!',
        role: 'field_agent',
      },
    });
  });

  it('forwards force-logout operations for agent sessions', async () => {
    const repository = createRepositoryMock({
      forceLogoutAgent: vi.fn().mockResolvedValue({
        agentId: 'agent-field-2',
        revoked: true,
        reason: 'Manual revoke',
        revokedAt: '2026-04-16T12:40:00.000Z',
      }),
    });
    const service = new SupervisorService(repository);

    const response = await service.forceLogoutAgent('agent-supervisor-1', 'agent-field-2', {
      reason: 'Manual revoke',
    });

    expect(response).toEqual({
      agentId: 'agent-field-2',
      revoked: true,
      reason: 'Manual revoke',
      revokedAt: '2026-04-16T12:40:00.000Z',
    });
    expect(repository.forceLogoutAgent).toHaveBeenCalledWith({
      supervisorAgentId: 'agent-supervisor-1',
      agentId: 'agent-field-2',
      request: {
        reason: 'Manual revoke',
      },
    });
  });

  it('forwards customer assignment mutations', async () => {
    const repository = createRepositoryMock({
      assignCustomerToAgent: vi.fn().mockResolvedValue({
        created: true,
        assignment: {
          customerId: 'cust-alpha',
          agentId: 'agent-2',
          assignedAt: '2026-04-16T09:00:00.000Z',
        },
      }),
      unassignCustomerFromAgent: vi.fn().mockResolvedValue({
        removed: true,
        removedAt: '2026-04-16T10:00:00.000Z',
      }),
    });
    const service = new SupervisorService(repository);

    const assigned = await service.assignCustomerToAgent('supervisor-1', 'cust-alpha', 'agent-2');
    const unassigned = await service.unassignCustomerFromAgent('supervisor-1', 'cust-alpha', 'agent-2');

    expect(assigned).toEqual({
      customerId: 'cust-alpha',
      created: true,
      assignment: {
        customerId: 'cust-alpha',
        agentId: 'agent-2',
        assignedAt: '2026-04-16T09:00:00.000Z',
      },
    });
    expect(unassigned).toEqual({
      customerId: 'cust-alpha',
      agentId: 'agent-2',
      removed: true,
      removedAt: '2026-04-16T10:00:00.000Z',
    });
    expect(repository.assignCustomerToAgent).toHaveBeenCalledWith({
      supervisorAgentId: 'supervisor-1',
      customerId: 'cust-alpha',
      agentId: 'agent-2',
    });
    expect(repository.unassignCustomerFromAgent).toHaveBeenCalledWith({
      supervisorAgentId: 'supervisor-1',
      customerId: 'cust-alpha',
      agentId: 'agent-2',
    });
  });

  it('forwards customer profile updates', async () => {
    const repository = createRepositoryMock({
      updateCustomerProfile: vi.fn().mockResolvedValue({
        customerId: 'cust-alpha',
        name: 'לקוח אלפא',
        contactName: 'שרה',
        phone: '+972500000010',
        city: 'תל אביב',
        notes: 'VIP',
        status: 'active',
        updatedAt: '2026-04-16T11:00:00.000Z',
      }),
    });
    const service = new SupervisorService(repository);

    const response = await service.updateCustomerProfile('supervisor-1', 'cust-alpha', {
      city: 'תל אביב',
      notes: 'VIP',
      status: 'active',
    });

    expect(response).toEqual({
      customerId: 'cust-alpha',
      name: 'לקוח אלפא',
      contactName: 'שרה',
      phone: '+972500000010',
      city: 'תל אביב',
      notes: 'VIP',
      status: 'active',
      updatedAt: '2026-04-16T11:00:00.000Z',
    });
    expect(repository.updateCustomerProfile).toHaveBeenCalledWith({
      supervisorAgentId: 'supervisor-1',
      customerId: 'cust-alpha',
      update: {
        city: 'תל אביב',
        notes: 'VIP',
        status: 'active',
      },
    });
  });
});

function createRepositoryMock(
  overrides: Partial<{
    listAgents: SupervisorRepository['listAgents'];
    listCustomers: SupervisorRepository['listCustomers'];
    getOversightSnapshot: SupervisorRepository['getOversightSnapshot'];
    listCustomerProfiles: SupervisorRepository['listCustomerProfiles'];
    listCustomerAssignments: SupervisorRepository['listCustomerAssignments'];
    createAgent: SupervisorRepository['createAgent'];
    forceLogoutAgent: SupervisorRepository['forceLogoutAgent'];
    updateAgentAccess: SupervisorRepository['updateAgentAccess'];
    bulkReassignCustomers: SupervisorRepository['bulkReassignCustomers'];
    listAuditEntries: SupervisorRepository['listAuditEntries'];
    assignCustomerToAgent: SupervisorRepository['assignCustomerToAgent'];
    unassignCustomerFromAgent: SupervisorRepository['unassignCustomerFromAgent'];
    updateCustomerProfile: SupervisorRepository['updateCustomerProfile'];
  }> = {},
): SupervisorRepository {
  return {
    listAgents: vi.fn().mockResolvedValue([]),
    listCustomers: vi.fn().mockResolvedValue([]),
    getOversightSnapshot: vi.fn().mockResolvedValue({
      window: {
        startAt: '1970-01-01T00:00:00.000Z',
        endAt: '1970-01-01T23:59:59.999Z',
        timezone: 'UTC',
      },
      orders: {
        totalOrders: 0,
        submittedCount: 0,
        pendingRetryCount: 0,
        failedCount: 0,
        totalAmount: 0,
        byAgent: [],
        byCustomer: [],
      },
      unassignedCustomers: {
        total: 0,
        customers: [],
      },
      erp: {
        pendingRetryCount: 0,
        failedCount: 0,
        totalNeedingAttention: 0,
        recentSignals: [],
      },
      funnel: {
        magicLinksIssued: 0,
        activationAttempts: 0,
        activationSuccesses: 0,
        sessionsActivated: 0,
        ordersSubmitted: 0,
        activationSuccessRate: 0,
        linkToSessionConversionRate: 0,
        sessionToOrderConversionRate: 0,
      },
      generatedAt: '1970-01-01T00:00:00.000Z',
    }),
    listCustomerProfiles: vi.fn().mockResolvedValue([]),
    listCustomerAssignments: vi.fn().mockResolvedValue([]),
    createAgent: vi.fn(),
    forceLogoutAgent: vi.fn(),
    updateAgentAccess: vi.fn(),
    bulkReassignCustomers: vi.fn(),
    listAuditEntries: vi.fn().mockResolvedValue({ entries: [], total: 0 }),
    assignCustomerToAgent: vi.fn(),
    unassignCustomerFromAgent: vi.fn(),
    updateCustomerProfile: vi.fn(),
    ...overrides,
  };
}
