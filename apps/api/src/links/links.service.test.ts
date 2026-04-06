import { createHash } from 'crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LinksService } from './links.service';
import type { LinksConfig, MagicLinkTokenGenerator, MagicLinksRepository } from './links.types';

describe('LinksService', () => {
  const repository: MagicLinksRepository = {
    issueForAssignedCustomer: vi.fn(),
  };

  const tokenGenerator: MagicLinkTokenGenerator = {
    generate: vi.fn(),
  };

  const config: LinksConfig = {
    magicLinkBaseUrl: 'https://portal.example.com/activate',
    magicLinkTtlSeconds: 5400,
  };

  const service = new LinksService(repository, tokenGenerator, config);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-07T10:00:00.000Z'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues link response with expiry metadata and passes hash-only persistence payload', async () => {
    vi.mocked(tokenGenerator.generate).mockReturnValue('plain-link-token');
    vi.mocked(repository.issueForAssignedCustomer).mockImplementation(async (input) => ({
      id: 'ml-1',
      tokenHash: input.tokenHash,
      hashCustomerId: input.customerId,
      issuedByAgentId: input.agentId,
      expiresAt: input.expiresAt,
      status: 'ISSUED',
    }));

    const response = await service.issueMagicLink('agent-9', 'cust-9');

    expect(repository.issueForAssignedCustomer).toHaveBeenCalledWith({
      agentId: 'agent-9',
      customerId: 'cust-9',
      tokenHash: createHash('sha256').update('plain-link-token').digest('hex'),
      expiresAt: new Date('2026-04-07T11:30:00.000Z'),
    });
    expect(response).toEqual({
      linkUrl: 'https://portal.example.com/activate?token=plain-link-token',
      expiresAt: '2026-04-07T11:30:00.000Z',
      expiresInSeconds: 5400,
      lifecycle: 'issued',
    });
  });
});
