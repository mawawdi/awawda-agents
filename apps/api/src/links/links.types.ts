import type { MagicLinkStatus } from '@prisma/client';

export interface LinksConfig {
  magicLinkBaseUrl: string;
  magicLinkTtlSeconds: number;
}

export interface IssueMagicLinkInput {
  agentId: string;
  customerId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface IssuedMagicLinkRecord {
  id: string;
  tokenHash: string;
  hashCustomerId: string;
  issuedByAgentId: string;
  expiresAt: Date;
  status: MagicLinkStatus;
}

export interface MagicLinksRepository {
  issueForAssignedCustomer(input: IssueMagicLinkInput): Promise<IssuedMagicLinkRecord | null>;
}

export interface MagicLinkTokenGenerator {
  generate(): string;
}
