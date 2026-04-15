import { createHash } from 'crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { CustomerPortalDataResponse, CustomerSessionActivateResponse } from '@awawda/shared-types';

import { ERP_GATEWAY, type ErpGateway } from '../erp/erp.gateway';
import { ActivationRateLimiter } from './activation-rate-limiter';
import {
  CUSTOMER_SESSIONS_REPOSITORY,
  CUSTOMER_SESSION_TOKEN_SIGNER,
  SESSIONS_CONFIG,
} from './sessions.constants';
import {
  CustomerActivationRateLimitedError,
  CustomerActivationTokenExpiredError,
  CustomerActivationTokenInvalidError,
} from './sessions.errors';
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
    @Inject(ActivationRateLimiter) private readonly activationRateLimiter: Pick<ActivationRateLimiter, 'consume'>,
  ) {}

  async activateSession(token: string, clientIp: string): Promise<CustomerSessionActivateResponse> {
    const normalizedToken = token.trim();
    const tokenHash = createHash('sha256').update(normalizedToken).digest('hex');
    const now = new Date();
    const normalizedClientIp = normalizeClientIp(clientIp);
    const rateLimit = this.activationRateLimiter.consume(normalizedClientIp, now);
    if (!rateLimit.allowed) {
      await this.customerSessionsRepository.recordActivationAttempt({
        tokenHash,
        clientIp: normalizedClientIp,
        occurredAt: now,
        outcome: 'throttled',
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
      throw new CustomerActivationRateLimitedError(rateLimit.retryAfterSeconds);
    }

    const sessionExpiresAt = new Date(
      now.getTime() + this.sessionsConfig.customerSessionTtlSeconds * 1000,
    );
    const activation = await this.customerSessionsRepository.activateMagicToken(
      tokenHash,
      now,
      sessionExpiresAt,
    );

    if (activation.kind === 'expired') {
      await this.customerSessionsRepository.recordActivationAttempt({
        tokenHash,
        clientIp: normalizedClientIp,
        occurredAt: now,
        outcome: 'fail',
        failureReason: 'expired_token',
      });
      throw new CustomerActivationTokenExpiredError();
    }

    if (activation.kind === 'invalid') {
      await this.customerSessionsRepository.recordActivationAttempt({
        tokenHash,
        clientIp: normalizedClientIp,
        occurredAt: now,
        outcome: 'fail',
        failureReason: 'invalid_token',
      });
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

    await this.customerSessionsRepository.recordActivationAttempt({
      tokenHash,
      clientIp: normalizedClientIp,
      occurredAt: now,
      outcome: 'success',
      customerId: activation.customerId,
    });

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
    const now = new Date();
    const [approvedItems, recentItemsSnapshot, pricingSnapshot, recentOrders] = await Promise.all([
      this.customerSessionsRepository.listApprovedItems(customerId),
      this.erpGateway.getCustomerRecentItems(customerId),
      this.erpGateway.getCustomerPricing(customerId),
      this.customerSessionsRepository.listRecentOrdersFeed(customerId, now),
    ]);

    return {
      customer: {
        customerId,
      },
      approvedItems,
      recentItems: recentItemsSnapshot.items,
      recentOrders,
      pricing: pricingSnapshot.lines,
      priceListVersion: pricingSnapshot.version,
      sessionExpiresAt,
    };
  }
}

function normalizeClientIp(clientIp: string): string {
  const normalized = clientIp.trim();
  if (normalized.length === 0) {
    return 'unknown';
  }

  return normalized.length <= 128 ? normalized : normalized.slice(0, 128);
}
