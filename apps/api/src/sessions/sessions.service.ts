import { createHash } from 'crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { CustomerPortalDataResponse, CustomerSessionActivateResponse } from '@meatland/shared-types';

import { ERP_GATEWAY, type ErpGateway } from '../erp/erp.gateway';
import {
  CUSTOMER_SESSIONS_REPOSITORY,
  CUSTOMER_SESSION_TOKEN_SIGNER,
  SESSIONS_CONFIG,
} from './sessions.constants';
import { CustomerActivationTokenExpiredError, CustomerActivationTokenInvalidError } from './sessions.errors';
import type { SessionsConfig } from './sessions.config';
import type { CustomerSessionTokenSigner, CustomerSessionsRepository } from './sessions.types';

@Injectable()
export class SessionsService {
  constructor(
    @Inject(CUSTOMER_SESSIONS_REPOSITORY)
    private readonly customerSessionsRepository: CustomerSessionsRepository,
    @Inject(CUSTOMER_SESSION_TOKEN_SIGNER)
    private readonly customerSessionTokenSigner: CustomerSessionTokenSigner,
    @Inject(SESSIONS_CONFIG) private readonly sessionsConfig: SessionsConfig,
    @Inject(ERP_GATEWAY) private readonly erpGateway: ErpGateway,
  ) {}

  async activateSession(token: string): Promise<CustomerSessionActivateResponse> {
    const normalizedToken = token.trim();
    const tokenHash = createHash('sha256').update(normalizedToken).digest('hex');
    const now = new Date();
    const sessionExpiresAt = new Date(
      now.getTime() + this.sessionsConfig.customerSessionTtlSeconds * 1000,
    );
    const activation = await this.customerSessionsRepository.activateMagicToken(
      tokenHash,
      now,
      sessionExpiresAt,
    );

    if (activation.kind === 'expired') {
      throw new CustomerActivationTokenExpiredError();
    }

    if (activation.kind === 'invalid') {
      throw new CustomerActivationTokenInvalidError();
    }

    const sessionToken = this.customerSessionTokenSigner.sign(
      {
        sub: activation.sessionId,
        customerId: activation.customerId,
        type: 'customer_session',
      },
      this.sessionsConfig.customerSessionTtlSeconds,
    );

    const portalData = await this.getPortalDataPayload(
      activation.customerId,
      activation.sessionExpiresAt.toISOString(),
    );

    return {
      sessionToken,
      ...portalData,
    };
  }

  async getPortalData(
    customerId: string,
    sessionExpiresAt: string,
  ): Promise<CustomerPortalDataResponse> {
    return this.getPortalDataPayload(customerId, sessionExpiresAt);
  }

  async logoutSession(sessionId: string, customerId: string): Promise<void> {
    await this.customerSessionsRepository.deactivateCustomerSession(sessionId, customerId, new Date());
  }

  private async getPortalDataPayload(
    customerId: string,
    sessionExpiresAt: string,
  ): Promise<CustomerPortalDataResponse> {
    const [approvedItems, recentItemsSnapshot, pricingSnapshot] = await Promise.all([
      this.customerSessionsRepository.listApprovedItems(customerId),
      this.erpGateway.getCustomerRecentItems(customerId),
      this.erpGateway.getCustomerPricing(customerId),
    ]);

    return {
      customer: {
        customerId,
      },
      approvedItems,
      recentItems: recentItemsSnapshot.items,
      pricing: pricingSnapshot.lines,
      priceListVersion: pricingSnapshot.version,
      sessionExpiresAt,
    };
  }
}
