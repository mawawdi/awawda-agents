import { describe, expect, it } from 'vitest';

import { ReadyService } from './ready.service';

describe('ReadyService', () => {
  it('returns dependency placeholders until downstream probes are implemented', () => {
    const service = new ReadyService();

    const result = service.getStatus();

    expect(result).toMatchObject({
      status: 'ready',
      service: 'api',
      version: 'v1',
      checks: {
        database: {
          status: 'unknown',
          required: true,
          detail: 'Database readiness probe not implemented yet.',
        },
        erp: {
          status: 'unknown',
          required: true,
          detail: 'ERP connector readiness probe not implemented yet.',
        },
        queue: {
          status: 'unknown',
          required: false,
          detail: 'Background queue readiness probe not implemented yet.',
        },
      },
    });
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
  });
});
