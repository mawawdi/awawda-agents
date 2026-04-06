import { describe, expect, it } from 'vitest';

import { createIdleState, markMismatch, markSubmitError, markSubmitting, markSuccess } from './order-submit-state';

describe('customer portal critical UI state', () => {
  it('disables submit while order request is in-flight', () => {
    expect(createIdleState()).toEqual({ status: 'idle', canSubmit: true });
    expect(markSubmitting()).toEqual({ status: 'submitting', canSubmit: false });
  });

  it('exposes line-level mismatch details for reconfirmation', () => {
    expect(
      markMismatch([
        {
          lineIndex: 0,
          itemId: 'hash-i-987',
          reason: 'ERP price updated from 45.20 to 49.90',
          submittedUnitPrice: 45.2,
          currentUnitPrice: 49.9,
        },
      ]),
    ).toEqual({
      status: 'mismatch',
      canSubmit: true,
      lines: [
        {
          lineIndex: 0,
          itemId: 'hash-i-987',
          reason: 'ERP price updated from 45.20 to 49.90',
          submittedUnitPrice: 45.2,
          currentUnitPrice: 49.9,
        },
      ],
    });
  });

  it('returns recoverable error state', () => {
    expect(markSubmitError('Could not submit order right now.')).toEqual({
      status: 'error',
      canSubmit: true,
      message: 'Could not submit order right now.',
    });
  });

  it('locks duplicate submit after success confirmation', () => {
    expect(markSuccess('ORD-2026-00077')).toEqual({
      status: 'success',
      canSubmit: false,
      orderRef: 'ORD-2026-00077',
    });
  });
});
