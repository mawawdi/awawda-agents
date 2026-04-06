import { describe, expect, it, vi } from 'vitest';

import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns stable health metadata and uptime snapshot', () => {
    const service = new HealthService();
    const uptimeSpy = vi.spyOn(process, 'uptime').mockReturnValue(42.9);

    const result = service.getStatus();

    expect(result).toMatchObject({
      status: 'ok',
      service: 'api',
      version: 'v1',
      uptimeSeconds: 42,
      checks: {
        api: 'up',
      },
    });
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');

    uptimeSpy.mockRestore();
  });
});
