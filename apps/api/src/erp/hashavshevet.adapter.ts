import { Injectable } from '@nestjs/common';

import { ERP_ERROR_CODES, ErpGatewayError } from './erp.errors';
import type {
  ErpGatewayCatalogSnapshot,
  ErpGatewayHealth,
  ErpOrderHandoffRequest,
  ErpOrderHandoffResponse,
} from './erp.gateway';

type RetryPolicy = {
  maxAttempts: number;
  initialBackoffMs: number;
};

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialBackoffMs: 200,
};

@Injectable()
export class HashavshevetAdapter {
  private readonly retryPolicy: RetryPolicy;

  constructor(retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY) {
    this.retryPolicy = retryPolicy;
  }

  async handoffOrder(_request: ErpOrderHandoffRequest): Promise<ErpOrderHandoffResponse> {
    return this.withRetry('hashavshevet.handoffOrder', async () => {
      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
        'Hashavshevet adapter skeleton is wired, but live transport is not configured yet.',
      );
    });
  }

  async getHealth(): Promise<ErpGatewayHealth> {
    return {
      provider: 'hashavshevet',
      status: 'degraded',
      detail: 'Hashavshevet adapter initialized in skeleton mode.',
    };
  }

  async getMasterCatalog(): Promise<ErpGatewayCatalogSnapshot> {
    return {
      source: 'hashavshevet',
      syncedAt: new Date().toISOString(),
      items: [
        {
          itemId: 'itm-beef-entrecote',
          sku: 'BEEF-ENT-001',
          name: 'Beef Entrecôte',
          unit: 'kg',
          isActive: true,
        },
        {
          itemId: 'itm-beef-mince',
          sku: 'BEEF-MIN-010',
          name: 'Beef Mince 20% Fat',
          unit: 'kg',
          isActive: true,
        },
        {
          itemId: 'itm-lamb-ribs',
          sku: 'LAMB-RIB-002',
          name: 'Lamb Ribs',
          unit: 'kg',
          isActive: true,
        },
      ],
    };
  }

  private async withRetry<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    let delayMs = this.retryPolicy.initialBackoffMs;

    for (let attempt = 1; attempt <= this.retryPolicy.maxAttempts; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        const isLastAttempt = attempt === this.retryPolicy.maxAttempts;
        if (isLastAttempt) {
          throw new ErpGatewayError(
            ERP_ERROR_CODES.ERP_ORDER_HANDOFF_FAILED,
            `${operation} failed after ${attempt} attempts.`,
            error,
          );
        }

        await sleep(delayMs);
        delayMs *= 2;
      }
    }

    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_ORDER_HANDOFF_FAILED,
      `${operation} failed unexpectedly.`,
    );
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
