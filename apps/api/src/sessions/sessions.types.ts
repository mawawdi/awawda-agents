import type { CustomerApprovedItem, CustomerRecentOrdersFeed } from '@awawda/shared-types';

export type SessionActivationResult =
  | {
      kind: 'activated';
      sessionId: string;
      customerId: string;
      sessionExpiresAt: Date;
    }
  | {
      kind: 'invalid';
    }
  | {
      kind: 'expired';
    };

export type CustomerSessionValidationResult =
  | {
      kind: 'valid';
      sessionId: string;
      customerId: string;
      sessionExpiresAt: Date;
    }
  | {
      kind: 'invalid';
    }
  | {
      kind: 'expired';
    };

export type ActivationAttemptOutcome = 'success' | 'fail' | 'throttled';

export type RecordActivationAttemptInput = {
  tokenHash: string;
  clientIp: string;
  occurredAt: Date;
  outcome: ActivationAttemptOutcome;
  customerId?: string;
  retryAfterSeconds?: number;
  failureReason?: 'invalid_token' | 'expired_token';
};

export interface CustomerSessionsRepository {
  activateMagicToken(tokenHash: string, now: Date, sessionExpiresAt: Date): Promise<SessionActivationResult>;
  validateCustomerSession(
    sessionId: string,
    customerId: string,
    now: Date,
  ): Promise<CustomerSessionValidationResult>;
  deactivateCustomerSession(sessionId: string, customerId: string, closedAt: Date): Promise<void>;
  recordActivationAttempt(input: RecordActivationAttemptInput): Promise<void>;
  listApprovedItems(customerId: string): Promise<CustomerApprovedItem[]>;
  listRecentOrdersFeed(customerId: string, now: Date): Promise<CustomerRecentOrdersFeed>;
}

export interface CustomerSessionTokenSigner {
  sign(payload: Record<string, unknown>, expiresInSeconds: number): string;
}
