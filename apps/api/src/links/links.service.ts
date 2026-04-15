import { createHash } from 'crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { AgentMagicLinkIssueResponse } from '@awawda/shared-types';

import { LINKS_CONFIG, MAGIC_LINKS_REPOSITORY, MAGIC_LINK_TOKEN_GENERATOR } from './links.constants';
import { AgentCustomerAccessDeniedError } from './links.errors';
import type { LinksConfig, MagicLinkTokenGenerator, MagicLinksRepository } from './links.types';

@Injectable()
export class LinksService {
  constructor(
    @Inject(MAGIC_LINKS_REPOSITORY) private readonly linksRepository: MagicLinksRepository,
    @Inject(MAGIC_LINK_TOKEN_GENERATOR) private readonly tokenGenerator: MagicLinkTokenGenerator,
    @Inject(LINKS_CONFIG) private readonly config: LinksConfig,
  ) {}

  async issueMagicLink(agentId: string, customerId: string): Promise<AgentMagicLinkIssueResponse> {
    const token = this.tokenGenerator.generate();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + this.config.magicLinkTtlSeconds * 1000);

    const issuedLink = await this.linksRepository.issueForAssignedCustomer({
      agentId,
      customerId,
      tokenHash,
      expiresAt,
    });

    if (!issuedLink) {
      throw new AgentCustomerAccessDeniedError();
    }

    const linkUrl = new URL(this.config.magicLinkBaseUrl);
    linkUrl.searchParams.set('token', token);

    return {
      linkUrl: linkUrl.toString(),
      expiresAt: issuedLink.expiresAt.toISOString(),
      expiresInSeconds: this.config.magicLinkTtlSeconds,
      lifecycle: 'issued',
    };
  }
}
