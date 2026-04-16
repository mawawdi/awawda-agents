import { describe, expect, it } from 'vitest';

import {
  assertProductionRuntimeGuardrails,
  isTestingSurfaceEnabled,
  resolveHashEnvironment,
} from './production-guardrails';

describe('production runtime guardrails', () => {
  it('keeps non-production runtime permissive', () => {
    expect(() =>
      assertProductionRuntimeGuardrails({
        NODE_ENV: 'development',
        HASH_ENV: 'testing',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('fails fast when production runtime is not aligned to HASH_ENV=production', () => {
    expect(() =>
      assertProductionRuntimeGuardrails({
        NODE_ENV: 'production',
        HASH_ENV: 'testing',
      } as NodeJS.ProcessEnv),
    ).toThrow('Production runtime requires HASH_ENV=production.');
  });

  it('fails fast when production runtime has no live credentials', () => {
    expect(() =>
      assertProductionRuntimeGuardrails({
        NODE_ENV: 'production',
        HASH_ENV: 'production',
      } as NodeJS.ProcessEnv),
    ).toThrow('Production runtime requires Hashavshevet production credentials');
  });

  it('accepts production runtime with REST production credentials', () => {
    expect(() =>
      assertProductionRuntimeGuardrails({
        NODE_ENV: 'production',
        HASH_ENV: 'production',
        HASH_PROD_API_URL: 'https://hash.prod.example/api',
        HASH_PROD_API_KEY: 'prod-secret',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('accepts production runtime with full H-Connect credentials', () => {
    expect(() =>
      assertProductionRuntimeGuardrails({
        NODE_ENV: 'production',
        HASH_ENV: 'production',
        HASH_HCONNECT_ENABLED: 'true',
        HASH_HCONNECT_STATION: 'station',
        HASH_HCONNECT_COMPANY: 'company',
        HASH_HCONNECT_NET_PASSPORT_ID: '12345',
        HASH_HCONNECT_SIGNATURE_TOKEN: 'signature',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('rejects unsupported HASH_ENV values', () => {
    expect(() => resolveHashEnvironment('staging')).toThrow('HASH_ENV must be either "testing" or "production".');
  });

  it('disables testing surfaces in production hash mode', () => {
    expect(isTestingSurfaceEnabled({ HASH_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isTestingSurfaceEnabled({ HASH_ENV: 'testing' } as NodeJS.ProcessEnv)).toBe(true);
  });
});
