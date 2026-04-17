import { describe, expect, it } from 'vitest';

import { resolveClientIp } from './sessions.controller';

describe('resolveClientIp', () => {
  it('uses forwarded client IP when request comes through a trusted proxy hop', () => {
    expect(
      resolveClientIp({
        ip: '127.0.0.1',
        headers: {
          'x-forwarded-for': '203.0.113.7, 10.0.0.12',
        },
      }),
    ).toBe('203.0.113.7');
  });

  it('ignores spoofable forwarded headers on direct public requests', () => {
    expect(
      resolveClientIp({
        ip: '198.51.100.90',
        headers: {
          'x-forwarded-for': '203.0.113.7',
          'x-real-ip': '203.0.113.8',
        },
      }),
    ).toBe('198.51.100.90');
  });

  it('falls back to x-real-ip for trusted proxy requests without forwarded-for', () => {
    expect(
      resolveClientIp({
        ip: '10.0.0.3',
        headers: {
          'x-real-ip': '203.0.113.18',
        },
      }),
    ).toBe('203.0.113.18');
  });
});
