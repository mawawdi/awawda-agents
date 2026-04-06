import type { CustomerApprovedItem } from '@meatland/shared-types';

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

export interface CustomerSessionsRepository {
  activateMagicToken(tokenHash: string, now: Date, sessionExpiresAt: Date): Promise<SessionActivationResult>;
  validateCustomerSession(
    sessionId: string,
    customerId: string,
    now: Date,
  ): Promise<CustomerSessionValidationResult>;
  listApprovedItems(customerId: string): Promise<CustomerApprovedItem[]>;
}

export interface CustomerSessionTokenSigner {
  sign(payload: Record<string, unknown>, expiresInSeconds: number): string;
}
