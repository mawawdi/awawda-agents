import jwt from 'jsonwebtoken';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiApp } from './server';
import { AGENT_CUSTOMERS_REPOSITORY } from './customers/customers.constants';
import type { AgentCustomersRepository } from './customers/customers.types';
import { ERP_ERROR_CODES, ErpGatewayError } from './erp/erp.errors';
import { ERP_GATEWAY, type ErpGateway } from './erp/erp.gateway';

describe('Agent read endpoints', () => {
  let app: NestFastifyApplication;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalJwtIssuer = process.env.JWT_ISSUER;
  const originalCatalogCacheTtl = process.env.CATALOG_CACHE_TTL_SECONDS;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'integration-test-secret';
    process.env.JWT_ISSUER = 'integration-suite';
    process.env.CATALOG_CACHE_TTL_SECONDS = '120';

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
    restoreEnv('CATALOG_CACHE_TTL_SECONDS', originalCatalogCacheTtl);
  });

  it('rejects customer reads without agent token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/agent/customers',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: 'AUTH_AGENT_TOKEN_REQUIRED',
      message: 'Agent access token is required',
    });
  });

  it('returns only assigned customers for the authenticated agent', async () => {
    const customersRepository = app.get<AgentCustomersRepository>(AGENT_CUSTOMERS_REPOSITORY);
    const erpGateway = app.get<ErpGateway>(ERP_GATEWAY);
    vi.spyOn(customersRepository, 'listAssignedCustomers').mockResolvedValue([
      {
        customerId: 'cust-alpha',
        approvedItemsCount: 3,
        lastOrderAt: '2026-04-06T18:00:00.000Z',
      },
      {
        customerId: 'cust-beta',
        approvedItemsCount: 0,
        lastOrderAt: null,
      },
    ]);
    vi.spyOn(erpGateway, 'getAssignedCustomers').mockResolvedValue({
      source: 'hashavshevet',
      syncedAt: '2026-04-06T18:00:00.000Z',
      customers: [],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/agent/customers',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-42')}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total: 2,
      customers: [
        {
          customerId: 'cust-alpha',
          approvedItemsCount: 3,
          lastOrderAt: '2026-04-06T18:00:00.000Z',
        },
        {
          customerId: 'cust-beta',
          approvedItemsCount: 0,
          lastOrderAt: null,
        },
      ],
    });
    expect(vi.mocked(customersRepository.listAssignedCustomers)).toHaveBeenCalledWith('agent-42');
    expect(vi.mocked(erpGateway.getAssignedCustomers)).toHaveBeenCalledWith('agent-42');
  });

  it('keeps customers response stable when Hash assigned-customer pull fails', async () => {
    const customersRepository = app.get<AgentCustomersRepository>(AGENT_CUSTOMERS_REPOSITORY);
    const erpGateway = app.get<ErpGateway>(ERP_GATEWAY);
    vi.spyOn(customersRepository, 'listAssignedCustomers').mockResolvedValue([
      {
        customerId: 'cust-alpha',
        approvedItemsCount: 3,
        lastOrderAt: '2026-04-06T18:00:00.000Z',
      },
    ]);
    vi.spyOn(erpGateway, 'getAssignedCustomers').mockRejectedValue(
      new ErpGatewayError(ERP_ERROR_CODES.ERP_UNAVAILABLE, 'hash down'),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/v1/agent/customers',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-42')}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total: 1,
      customers: [
        {
          customerId: 'cust-alpha',
          approvedItemsCount: 3,
          lastOrderAt: '2026-04-06T18:00:00.000Z',
        },
      ],
    });
    expect(vi.mocked(erpGateway.getAssignedCustomers)).toHaveBeenCalledWith('agent-42');
  });

  it('returns catalog with cache headers and cache metadata', async () => {
    const erpGateway = app.get<ErpGateway>(ERP_GATEWAY);
    vi.spyOn(erpGateway, 'getMasterCatalog').mockResolvedValue({
      source: 'hashavshevet',
      syncedAt: '2026-04-06T18:30:00.000Z',
      items: [
        {
          itemId: 'itm-1',
          sku: 'SKU-1',
          name: 'Chuck Roast',
          unit: 'kg',
          isActive: true,
        },
      ],
    });

    const headers = {
      authorization: `Bearer ${signAgentToken('agent-7')}`,
    };

    const first = await app.inject({
      method: 'GET',
      url: '/v1/agent/catalog',
      headers,
    });

    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('private, max-age=120');
    expect(first.headers['x-cache-status']).toBe('miss');
    expect(first.headers.etag).toMatch(/^W\//);
    expect(first.json()).toMatchObject({
      source: 'hashavshevet',
      cache: {
        status: 'miss',
        generatedAt: '2026-04-06T18:30:00.000Z',
        ttlSeconds: 120,
      },
      items: [
        {
          itemId: 'itm-1',
          sku: 'SKU-1',
          name: 'Chuck Roast',
          unit: 'kg',
          isActive: true,
        },
      ],
    });

    const second = await app.inject({
      method: 'GET',
      url: '/v1/agent/catalog',
      headers,
    });

    expect(second.statusCode).toBe(200);
    expect(second.headers['x-cache-status']).toBe('hit');
    expect(second.json()).toMatchObject({
      cache: {
        status: 'hit',
        ttlSeconds: 120,
      },
    });
    expect(vi.mocked(erpGateway.getMasterCatalog)).toHaveBeenCalledTimes(1);
  });

  it('returns approved items for an assigned customer', async () => {
    const customersRepository = app.get<AgentCustomersRepository>(AGENT_CUSTOMERS_REPOSITORY);
    vi.spyOn(customersRepository, 'isAgentAssignedToCustomer').mockResolvedValue(true);
    vi.spyOn(customersRepository, 'listApprovedItems').mockResolvedValue([
      {
        hashItemId: 'itm-9',
        addedByAgentId: 'agent-42',
        createdAt: '2026-04-06T18:45:00.000Z',
      },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/agent/customers/cust-alpha/approved-items',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-42')}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      customerId: 'cust-alpha',
      total: 1,
      items: [
        {
          hashItemId: 'itm-9',
          addedByAgentId: 'agent-42',
          createdAt: '2026-04-06T18:45:00.000Z',
        },
      ],
    });
    expect(vi.mocked(customersRepository.isAgentAssignedToCustomer)).toHaveBeenCalledWith(
      'agent-42',
      'cust-alpha',
    );
    expect(vi.mocked(customersRepository.listApprovedItems)).toHaveBeenCalledWith('cust-alpha');
  });

  it('blocks approved items read for unassigned customers', async () => {
    const customersRepository = app.get<AgentCustomersRepository>(AGENT_CUSTOMERS_REPOSITORY);
    vi.spyOn(customersRepository, 'isAgentAssignedToCustomer').mockResolvedValue(false);
    const listApprovedItemsSpy = vi.spyOn(customersRepository, 'listApprovedItems');

    const response = await app.inject({
      method: 'GET',
      url: '/v1/agent/customers/cust-locked/approved-items',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-42')}`,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: 'AUTH_AGENT_CUSTOMER_ASSIGNMENT_REQUIRED',
      message: 'Agent is not assigned to this customer',
    });
    expect(listApprovedItemsSpy).not.toHaveBeenCalled();
  });

  it('adds approved items for assigned customers', async () => {
    const customersRepository = app.get<AgentCustomersRepository>(AGENT_CUSTOMERS_REPOSITORY);
    vi.spyOn(customersRepository, 'isAgentAssignedToCustomer').mockResolvedValue(true);
    vi.spyOn(customersRepository, 'addApprovedItem').mockResolvedValue({
      created: true,
      item: {
        hashItemId: 'itm-11',
        addedByAgentId: 'agent-42',
        createdAt: '2026-04-06T19:00:00.000Z',
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent/customers/cust-alpha/approved-items',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-42')}`,
      },
      payload: {
        hashItemId: 'itm-11',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      customerId: 'cust-alpha',
      created: true,
      item: {
        hashItemId: 'itm-11',
        addedByAgentId: 'agent-42',
        createdAt: '2026-04-06T19:00:00.000Z',
      },
    });
    expect(vi.mocked(customersRepository.addApprovedItem)).toHaveBeenCalledWith(
      'cust-alpha',
      'itm-11',
      'agent-42',
    );
  });

  it('returns duplicate-safe response when approved item already exists', async () => {
    const customersRepository = app.get<AgentCustomersRepository>(AGENT_CUSTOMERS_REPOSITORY);
    vi.spyOn(customersRepository, 'isAgentAssignedToCustomer').mockResolvedValue(true);
    vi.spyOn(customersRepository, 'addApprovedItem').mockResolvedValue({
      created: false,
      item: {
        hashItemId: 'itm-11',
        addedByAgentId: 'agent-7',
        createdAt: '2026-04-05T10:00:00.000Z',
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent/customers/cust-alpha/approved-items',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-42')}`,
      },
      payload: {
        hashItemId: 'itm-11',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      customerId: 'cust-alpha',
      created: false,
      item: {
        hashItemId: 'itm-11',
        addedByAgentId: 'agent-7',
        createdAt: '2026-04-05T10:00:00.000Z',
      },
    });
  });

  it('blocks approved item mutation for unassigned customers', async () => {
    const customersRepository = app.get<AgentCustomersRepository>(AGENT_CUSTOMERS_REPOSITORY);
    vi.spyOn(customersRepository, 'isAgentAssignedToCustomer').mockResolvedValue(false);
    const addApprovedItemSpy = vi.spyOn(customersRepository, 'addApprovedItem');

    const response = await app.inject({
      method: 'POST',
      url: '/v1/agent/customers/cust-locked/approved-items',
      headers: {
        authorization: `Bearer ${signAgentToken('agent-42')}`,
      },
      payload: {
        hashItemId: 'itm-11',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: 'AUTH_AGENT_CUSTOMER_ASSIGNMENT_REQUIRED',
      message: 'Agent is not assigned to this customer',
    });
    expect(addApprovedItemSpy).not.toHaveBeenCalled();
  });
});

function signAgentToken(agentId: string): string {
  return jwt.sign(
    {
      sub: agentId,
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
