import jwt from 'jsonwebtoken';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiApp } from './server';
import { SUPERVISOR_REPOSITORY } from './supervisor/supervisor.constants';
import type { SupervisorRepository } from './supervisor/supervisor.types';

describe('Supervisor endpoints', () => {
  let app: NestFastifyApplication;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalJwtIssuer = process.env.JWT_ISSUER;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'integration-supervisor-secret';
    process.env.JWT_ISSUER = 'integration-supervisor-suite';

    app = await createApiApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    restoreEnv('JWT_SECRET', originalJwtSecret);
    restoreEnv('JWT_ISSUER', originalJwtIssuer);
  });

  it('rejects supervisor routes without an access token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/supervisor/agents',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: 'AUTH_AGENT_TOKEN_REQUIRED',
      message: 'Agent access token is required',
    });
  });

  it('rejects supervisor routes for field-agent tokens', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/supervisor/agents',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-field', 'field_agent')}`,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: 'AUTH_SUPERVISOR_REQUIRED',
      message: 'Supervisor role is required',
    });
  });

  it('returns supervisor agents overview payload', async () => {
    const supervisorRepository = app.get<SupervisorRepository>(SUPERVISOR_REPOSITORY);
    vi.spyOn(supervisorRepository, 'listAgents').mockResolvedValue([
      {
        agentId: 'agent-field-1',
        name: 'Parpar',
        phone: '+972500000000',
        email: 'parpar@awawda.test',
        role: 'field_agent',
        isActive: true,
        assignmentCount: 5,
      },
      {
        agentId: 'agent-supervisor-1',
        name: 'Supervisor Salwa',
        phone: '+972501100099',
        email: 'supervisor.salwa@awawda.test',
        role: 'supervisor',
        isActive: true,
        assignmentCount: 0,
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/supervisor/agents',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-supervisor-1', 'supervisor')}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total: 2,
      agents: [
        {
          agentId: 'agent-field-1',
          role: 'field_agent',
          assignmentCount: 5,
        },
        {
          agentId: 'agent-supervisor-1',
          role: 'supervisor',
          assignmentCount: 0,
        },
      ],
    });
  });

  it('creates a new agent account from supervisor control plane', async () => {
    const supervisorRepository = app.get<SupervisorRepository>(SUPERVISOR_REPOSITORY);
    vi.spyOn(supervisorRepository, 'createAgent').mockResolvedValue({
      agent: {
        agentId: 'agent-new-1',
        name: 'Agent New',
        phone: '+972500000099',
        email: 'agent.new@awawda.test',
        role: 'field_agent',
        isActive: true,
        assignmentCount: 0,
      },
      createdAt: '2026-04-16T11:05:00.000Z',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/supervisor/agents',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-supervisor-1', 'supervisor')}`,
      },
      payload: {
        name: 'Agent New',
        phone: '+972500000099',
        email: 'agent.new@awawda.test',
        password: 'Password123!',
        role: 'field_agent',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      agent: {
        agentId: 'agent-new-1',
        name: 'Agent New',
        phone: '+972500000099',
        email: 'agent.new@awawda.test',
        role: 'field_agent',
        isActive: true,
        assignmentCount: 0,
      },
      createdAt: '2026-04-16T11:05:00.000Z',
    });
    expect(supervisorRepository.createAgent).toHaveBeenCalledWith({
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

  it('updates agent access state via supervisor endpoint', async () => {
    const supervisorRepository = app.get<SupervisorRepository>(SUPERVISOR_REPOSITORY);
    vi.spyOn(supervisorRepository, 'updateAgentAccess').mockResolvedValue({
      agent: {
        agentId: 'agent-field-2',
        name: 'Line Agent 2',
        phone: '+972500000002',
        email: null,
        role: 'field_agent',
        isActive: false,
        assignmentCount: 4,
      },
      changed: true,
      reason: 'Vacation',
      updatedAt: '2026-04-16T11:20:00.000Z',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/supervisor/agents/agent-field-2/access',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-supervisor-1', 'supervisor')}`,
      },
      payload: {
        isActive: false,
        reason: 'Vacation',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      agent: {
        agentId: 'agent-field-2',
        name: 'Line Agent 2',
        phone: '+972500000002',
        email: null,
        role: 'field_agent',
        isActive: false,
        assignmentCount: 4,
      },
      changed: true,
      reason: 'Vacation',
      updatedAt: '2026-04-16T11:20:00.000Z',
    });
  });

  it('forces active sessions logout for a selected agent', async () => {
    const supervisorRepository = app.get<SupervisorRepository>(SUPERVISOR_REPOSITORY);
    vi.spyOn(supervisorRepository, 'forceLogoutAgent').mockResolvedValue({
      agentId: 'agent-field-2',
      revoked: true,
      reason: 'Manual revoke',
      revokedAt: '2026-04-16T11:25:00.000Z',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/supervisor/agents/agent-field-2/force-logout',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-supervisor-1', 'supervisor')}`,
      },
      payload: {
        reason: 'Manual revoke',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      agentId: 'agent-field-2',
      revoked: true,
      reason: 'Manual revoke',
      revokedAt: '2026-04-16T11:25:00.000Z',
    });
    expect(supervisorRepository.forceLogoutAgent).toHaveBeenCalledWith({
      supervisorAgentId: 'agent-supervisor-1',
      agentId: 'agent-field-2',
      request: {
        reason: 'Manual revoke',
      },
    });
  });

  it('returns customers with assignment metadata for supervisors', async () => {
    const supervisorRepository = app.get<SupervisorRepository>(SUPERVISOR_REPOSITORY);
    vi.spyOn(supervisorRepository, 'listCustomers').mockResolvedValue([
      {
        customerId: 'cust-alpha',
        name: 'לקוח אלפא',
        contactName: 'שרה',
        phone: '+972500000001',
        city: 'תל אביב',
        notes: null,
        status: 'active',
        updatedAt: '2026-04-16T10:00:00.000Z',
        assignment: {
          assignmentCount: 2,
          assignedAgentIds: ['agent-1', 'agent-2'],
          lastAssignedAt: '2026-04-16T09:30:00.000Z',
        },
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/supervisor/customers',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-supervisor-1', 'supervisor')}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total: 1,
      customers: [
        {
          customerId: 'cust-alpha',
          status: 'active',
          assignment: {
            assignmentCount: 2,
            assignedAgentIds: ['agent-1', 'agent-2'],
            lastAssignedAt: '2026-04-16T09:30:00.000Z',
          },
        },
      ],
    });
  });

  it('returns supervisor oversight dashboard analytics payload', async () => {
    const supervisorRepository = app.get<SupervisorRepository>(SUPERVISOR_REPOSITORY);
    vi.spyOn(supervisorRepository, 'getOversightSnapshot').mockResolvedValue({
      window: {
        startAt: '2026-04-16T00:00:00.000Z',
        endAt: '2026-04-16T23:59:59.999Z',
        timezone: 'Asia/Jerusalem',
      },
      orders: {
        totalOrders: 4,
        submittedCount: 2,
        pendingRetryCount: 1,
        failedCount: 1,
        totalAmount: 2120.5,
        byAgent: [
          {
            agentId: 'agent-field-1',
            agentName: 'Line Agent 1',
            orderCount: 3,
            submittedCount: 2,
            pendingRetryCount: 1,
            failedCount: 0,
            totalAmount: 1700.5,
          },
        ],
        byCustomer: [
          {
            customerId: 'cust-alpha',
            customerName: 'לקוח אלפא',
            assignedAgentId: 'agent-field-1',
            assignedAgentName: 'Line Agent 1',
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
            updatedAt: '2026-04-16T09:00:00.000Z',
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
        failedCount: 1,
        totalNeedingAttention: 2,
        recentSignals: [
          {
            orderId: 'order-2',
            orderRef: 'bmax-queue:order-2:120',
            customerId: 'cust-beta',
            customerName: 'לקוח בטא',
            assignedAgentId: 'agent-field-2',
            assignedAgentName: 'Line Agent 2',
            status: 'failed',
            submittedAt: '2026-04-16T11:30:00.000Z',
            estimatedTotal: 420,
          },
        ],
      },
      funnel: {
        magicLinksIssued: 12,
        activationAttempts: 10,
        activationSuccesses: 8,
        sessionsActivated: 8,
        ordersSubmitted: 6,
        activationSuccessRate: 80,
        linkToSessionConversionRate: 66.7,
        sessionToOrderConversionRate: 75,
      },
      generatedAt: '2026-04-16T11:45:00.000Z',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/supervisor/oversight',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-supervisor-1', 'supervisor')}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      window: {
        timezone: 'Asia/Jerusalem',
      },
      orders: {
        totalOrders: 4,
        pendingRetryCount: 1,
        failedCount: 1,
      },
      unassignedCustomers: {
        total: 1,
      },
      erp: {
        totalNeedingAttention: 2,
      },
      funnel: {
        activationSuccessRate: 80,
      },
    });
    expect(supervisorRepository.getOversightSnapshot).toHaveBeenCalledWith();
  });

  it('bulk-reassigns customer ownership from one agent to another', async () => {
    const supervisorRepository = app.get<SupervisorRepository>(SUPERVISOR_REPOSITORY);
    vi.spyOn(supervisorRepository, 'bulkReassignCustomers').mockResolvedValue({
      fromAgentId: 'agent-field-1',
      toAgentId: 'agent-field-2',
      requestedCustomers: 2,
      reassignedCustomers: 2,
      skippedCustomers: 0,
      createdAssignments: 1,
      removedAssignments: 2,
      processedCustomerIds: ['cust-alpha', 'cust-beta'],
      generatedAt: '2026-04-16T11:30:00.000Z',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/supervisor/customers/bulk-reassign',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-supervisor-1', 'supervisor')}`,
      },
      payload: {
        fromAgentId: 'agent-field-1',
        toAgentId: 'agent-field-2',
        customerIds: ['cust-alpha', 'cust-beta'],
        reason: 'Coverage balancing',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      fromAgentId: 'agent-field-1',
      toAgentId: 'agent-field-2',
      requestedCustomers: 2,
      reassignedCustomers: 2,
      createdAssignments: 1,
      removedAssignments: 2,
      processedCustomerIds: ['cust-alpha', 'cust-beta'],
    });
    expect(supervisorRepository.bulkReassignCustomers).toHaveBeenCalledWith({
      supervisorAgentId: 'agent-supervisor-1',
      request: {
        fromAgentId: 'agent-field-1',
        toAgentId: 'agent-field-2',
        customerIds: ['cust-alpha', 'cust-beta'],
        reason: 'Coverage balancing',
      },
    });
  });

  it('assigns customer ownership and returns created=true', async () => {
    const supervisorRepository = app.get<SupervisorRepository>(SUPERVISOR_REPOSITORY);
    vi.spyOn(supervisorRepository, 'assignCustomerToAgent').mockResolvedValue({
      created: true,
      assignment: {
        customerId: 'cust-alpha',
        agentId: 'agent-field-2',
        assignedAt: '2026-04-16T11:00:00.000Z',
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/supervisor/customers/cust-alpha/assignments',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-supervisor-1', 'supervisor')}`,
      },
      payload: {
        agentId: 'agent-field-2',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      customerId: 'cust-alpha',
      created: true,
      assignment: {
        customerId: 'cust-alpha',
        agentId: 'agent-field-2',
        assignedAt: '2026-04-16T11:00:00.000Z',
      },
    });
    expect(supervisorRepository.assignCustomerToAgent).toHaveBeenCalledWith({
      supervisorAgentId: 'agent-supervisor-1',
      customerId: 'cust-alpha',
      agentId: 'agent-field-2',
    });
  });

  it('returns removed state when unassigning customer ownership', async () => {
    const supervisorRepository = app.get<SupervisorRepository>(SUPERVISOR_REPOSITORY);
    vi.spyOn(supervisorRepository, 'unassignCustomerFromAgent').mockResolvedValue({
      removed: true,
      removedAt: '2026-04-16T11:05:00.000Z',
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/supervisor/customers/cust-alpha/assignments/agent-field-2',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-supervisor-1', 'supervisor')}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      customerId: 'cust-alpha',
      agentId: 'agent-field-2',
      removed: true,
      removedAt: '2026-04-16T11:05:00.000Z',
    });
  });

  it('updates customer profile metadata', async () => {
    const supervisorRepository = app.get<SupervisorRepository>(SUPERVISOR_REPOSITORY);
    vi.spyOn(supervisorRepository, 'updateCustomerProfile').mockResolvedValue({
      customerId: 'cust-alpha',
      name: 'לקוח אלפא',
      contactName: 'שרה',
      phone: '+972500000001',
      city: 'ירושלים',
      notes: 'טופל על ידי הסופרווייזר',
      status: 'on_hold',
      updatedAt: '2026-04-16T11:10:00.000Z',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/supervisor/customers/cust-alpha/profile',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-supervisor-1', 'supervisor')}`,
      },
      payload: {
        city: 'ירושלים',
        notes: 'טופל על ידי הסופרווייזר',
        status: 'on_hold',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      customerId: 'cust-alpha',
      name: 'לקוח אלפא',
      contactName: 'שרה',
      phone: '+972500000001',
      city: 'ירושלים',
      notes: 'טופל על ידי הסופרווייזר',
      status: 'on_hold',
      updatedAt: '2026-04-16T11:10:00.000Z',
    });
    expect(supervisorRepository.updateCustomerProfile).toHaveBeenCalledWith({
      supervisorAgentId: 'agent-supervisor-1',
      customerId: 'cust-alpha',
      update: {
        city: 'ירושלים',
        notes: 'טופל על ידי הסופרווייזר',
        status: 'on_hold',
      },
    });
  });

  it('returns filtered audit log entries for supervisors', async () => {
    const supervisorRepository = app.get<SupervisorRepository>(SUPERVISOR_REPOSITORY);
    vi.spyOn(supervisorRepository, 'listAuditEntries').mockResolvedValue({
      total: 1,
      entries: [
        {
          id: 'audit-1',
          actorType: 'agent',
          actorId: 'agent-supervisor-1',
          eventType: 'supervisor.customer_profile.updated',
          eventPayload: { customerId: 'cust-alpha' },
          createdAt: '2026-04-16T11:40:00.000Z',
        },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/supervisor/audit?customerId=cust-alpha&page=1&pageSize=20',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-supervisor-1', 'supervisor')}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
      entries: [
        {
          id: 'audit-1',
          actorType: 'agent',
          actorId: 'agent-supervisor-1',
          eventType: 'supervisor.customer_profile.updated',
        },
      ],
    });
    expect(supervisorRepository.listAuditEntries).toHaveBeenCalledWith({
      actorId: undefined,
      customerId: 'cust-alpha',
      eventType: undefined,
      fromDate: undefined,
      toDate: undefined,
      page: 1,
      pageSize: 20,
    });
  });
});

function signAgentToken(agentId: string, role: 'field_agent' | 'supervisor'): string {
  return jwt.sign(
    {
      sub: agentId,
      role,
      type: 'agent_shift',
    },
    process.env.JWT_SECRET!,
    {
      algorithm: 'HS256',
      issuer: process.env.JWT_ISSUER,
      expiresIn: '15m',
    },
  );
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
