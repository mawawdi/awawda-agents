import { describe, expect, it } from 'vitest';

import { loadAuthConfig } from './auth.config';

describe('loadAuthConfig', () => {
  it('loads defaults and parses duration-based shift token ttl', () => {
    const config = loadAuthConfig({
      JWT_SECRET: 'top-secret',
      JWT_SHIFT_TOKEN_TTL: '15m',
    });

    expect(config).toMatchObject({
      jwtSecret: 'top-secret',
      jwtIssuer: 'awawda-api',
      shiftTokenTtlSeconds: 900,
    });
  });

  it('supports custom issuer and day-based ttl', () => {
    const config = loadAuthConfig({
      JWT_SECRET: 'top-secret',
      JWT_ISSUER: 'qa-suite',
      JWT_SHIFT_TOKEN_TTL: '2d',
    });

    expect(config.shiftTokenTtlSeconds).toBe(172800);
    expect(config.jwtIssuer).toBe('qa-suite');
  });

  it('throws when JWT_SECRET is missing', () => {
    expect(() =>
      loadAuthConfig({
        JWT_SHIFT_TOKEN_TTL: '8h',
      }),
    ).toThrow('JWT_SECRET is required for agent authentication');
  });

  it('throws on malformed ttl', () => {
    expect(() =>
      loadAuthConfig({
        JWT_SECRET: 'top-secret',
        JWT_SHIFT_TOKEN_TTL: 'abc',
      }),
    ).toThrow('JWT_SHIFT_TOKEN_TTL must be in the form <number>[s|m|h|d]. Example: 8h');
  });
});
