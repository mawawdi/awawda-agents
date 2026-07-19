import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OrderSessionConflictError } from './orders.errors';
import { PrismaOrdersRepository } from './orders.repository';
import type { PersistOrderSubmissionInput } from './orders.types';

const TEST_AGENT_PHONE = '+972-000-repo-test';
const CUSTOMER_PREFIX = 'cust-reptest';

async function cleanup(prisma: PrismaClient): Promise<void> {
  await prisma.order.deleteMany({ where: { hashCustomerId: { startsWith: CUSTOMER_PREFIX } } });
  await prisma.session.deleteMany({ where: { hashCustomerId: { startsWith: CUSTOMER_PREFIX } } });
  await prisma.magicLink.deleteMany({ where: { hashCustomerId: { startsWith: CUSTOMER_PREFIX } } });
  await prisma.agent.deleteMany({ where: { phone: TEST_AGENT_PHONE } });
}

async function seedActiveSession(
  prisma: PrismaClient,
  agentId: string,
  suffix: string,
): Promise<{ sessionId: string; magicLinkId: string; customerId: string }> {
  const customerId = `${CUSTOMER_PREFIX}-${suffix}`;
  const magicLink = await prisma.magicLink.create({
    data: {
      tokenHash: `reptest-token-${suffix}`,
      hashCustomerId: customerId,
      issuedByAgentId: agentId,
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    },
  });
  const session = await prisma.session.create({
    data: {
      magicLinkId: magicLink.id,
      hashCustomerId: customerId,
      sessionExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
    },
  });
  return { sessionId: session.id, magicLinkId: magicLink.id, customerId };
}

function buildInput(
  orderId: string,
  sessionId: string,
  customerId: string,
  orderRef: string,
): PersistOrderSubmissionInput {
  return {
    orderId,
    customerId,
    customerSessionId: sessionId,
    orderRef,
    status: 'submitted',
    submittedAt: '2026-04-10T11:00:00.000Z',
    submittedByAgentId: null,
    hashSubmittedByAgentId: null,
    lines: [
      {
        itemId: 'item-1',
        quantity: 1,
        unit: 'kg',
        clientUnitPrice: 49.9,
        itemNameSnapshot: 'Ribeye',
        unitPriceSnapshot: 49.9,
        lineTotalSnapshot: 49.9,
      },
    ],
    estimatedTotal: 49.9,
    requestedDeliveryDate: null,
    consumeSession: true,
  };
}

describe('PrismaOrdersRepository.persistOrderSubmission — single-use session gate', () => {
  const prisma = new PrismaClient();
  const repo = new PrismaOrdersRepository(prisma);
  let agentId: string;

  beforeAll(async () => {
    await cleanup(prisma);
    const agent = await prisma.agent.create({
      data: {
        name: 'Repo Test Agent',
        phone: TEST_AGENT_PHONE,
        passwordHash: 'argon2-placeholder',
      },
    });
    agentId = agent.id;
  });

  beforeEach(async () => {
    await prisma.order.deleteMany({ where: { hashCustomerId: { startsWith: CUSTOMER_PREFIX } } });
    await prisma.session.deleteMany({ where: { hashCustomerId: { startsWith: CUSTOMER_PREFIX } } });
    await prisma.magicLink.deleteMany({ where: { hashCustomerId: { startsWith: CUSTOMER_PREFIX } } });
  });

  afterAll(async () => {
    await cleanup(prisma);
    await prisma.$disconnect();
  });

  it('consumes the session on first submit and rejects a second submit for that session', async () => {
    const { sessionId, customerId, magicLinkId } = await seedActiveSession(prisma, agentId, 'seq');

    await repo.persistOrderSubmission(buildInput(randomUUID(), sessionId, customerId, 'REPTEST-REF-1'));

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    expect(session?.status).toBe('CLOSED');
    expect(session?.isActive).toBe(false);
    const link = await prisma.magicLink.findUnique({ where: { id: magicLinkId } });
    expect(link?.status).toBe('CONSUMED');

    await expect(
      repo.persistOrderSubmission(buildInput(randomUUID(), sessionId, customerId, 'REPTEST-REF-2')),
    ).rejects.toBeInstanceOf(OrderSessionConflictError);

    const orders = await prisma.order.findMany({ where: { customerSessionId: sessionId } });
    expect(orders).toHaveLength(1);
  });

  it('allows only one of two concurrent submits for the same single-use session', async () => {
    const { sessionId, customerId } = await seedActiveSession(prisma, agentId, 'conc');

    const results = await Promise.allSettled([
      repo.persistOrderSubmission(buildInput(randomUUID(), sessionId, customerId, 'REPTEST-CONC-1')),
      repo.persistOrderSubmission(buildInput(randomUUID(), sessionId, customerId, 'REPTEST-CONC-2')),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(OrderSessionConflictError);

    const orders = await prisma.order.findMany({ where: { customerSessionId: sessionId } });
    expect(orders).toHaveLength(1);
  });
});
