import { describe, expect, it } from 'vitest';

import { loadLinksConfig } from './links.config';

describe('loadLinksConfig', () => {
  it('uses defaults when env vars are missing', () => {
    const config = loadLinksConfig({});

    expect(config.magicLinkTtlSeconds).toBe(86400);
    expect(config.magicLinkBaseUrl).toBe('https://portal.awawda.local/activate');
  });

  it('normalizes localhost https URLs to http', () => {
    const config = loadLinksConfig({
      MAGIC_LINK_BASE_URL: 'https://localhost:8080/m',
      MAGIC_LINK_TTL_SECONDS: '3600',
    });

    expect(config.magicLinkBaseUrl).toBe('http://localhost:8080/m');
    expect(config.magicLinkTtlSeconds).toBe(3600);
  });

  it('throws when magic-link base URL is invalid', () => {
    expect(() =>
      loadLinksConfig({
        MAGIC_LINK_BASE_URL: 'not-a-url',
      }),
    ).toThrow('MAGIC_LINK_BASE_URL must be a valid absolute URL');
  });
});
