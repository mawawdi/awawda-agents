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

  it('ignores a spoofed leftmost X-Forwarded-For entry and uses the rightmost untrusted client', () => {
    // The client prepends a fake IP; the proxy appends the real client on the right. The leftmost
    // value must not win, or the per-IP activation rate limiter is trivially bypassed.
    expect(
      resolveClientIp({
        ip: '10.0.0.5',
        headers: {
          'x-forwarded-for': '1.2.3.4, 203.0.113.7, 10.0.0.12',
        },
      }),
    ).toBe('203.0.113.7');
  });
});
