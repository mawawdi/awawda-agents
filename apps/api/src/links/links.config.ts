import type { LinksConfig } from './links.types';

const DEFAULT_MAGIC_LINK_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_MAGIC_LINK_BASE_URL = 'https://portal.awawda.local/activate';

function normalizeMagicLinkBaseUrl(rawBaseUrl: string): string {
  const parsed = new URL(rawBaseUrl);
  const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

  if (isLocalHost && parsed.protocol === 'https:') {
    parsed.protocol = 'http:';
  }

  return parsed.toString();
}

export function loadLinksConfig(env: NodeJS.ProcessEnv = process.env): LinksConfig {
  const rawTtl = env.MAGIC_LINK_TTL_SECONDS;
  const magicLinkTtlSeconds = rawTtl ? Number(rawTtl) : DEFAULT_MAGIC_LINK_TTL_SECONDS;

  if (!Number.isInteger(magicLinkTtlSeconds) || magicLinkTtlSeconds <= 0) {
    throw new Error('MAGIC_LINK_TTL_SECONDS must be a positive integer');
  }

  const magicLinkBaseUrl = env.MAGIC_LINK_BASE_URL?.trim() || DEFAULT_MAGIC_LINK_BASE_URL;

  try {
    const normalizedBaseUrl = normalizeMagicLinkBaseUrl(magicLinkBaseUrl);
    return {
      magicLinkBaseUrl: normalizedBaseUrl,
      magicLinkTtlSeconds,
    };
  } catch {
    throw new Error('MAGIC_LINK_BASE_URL must be a valid absolute URL');
  }
}
