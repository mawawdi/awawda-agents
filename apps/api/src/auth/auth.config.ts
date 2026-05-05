import type { AuthConfig } from './auth.types';

const DURATION_PATTERN = /^(\d+)([smhd])$/;

function parseDurationToSeconds(rawDuration: string): number {
  const normalized = rawDuration.trim().toLowerCase();
  const match = DURATION_PATTERN.exec(normalized);

  if (!match) {
    throw new Error('JWT_SHIFT_TOKEN_TTL must be in the form <number>[s|m|h|d]. Example: 8h');
  }

  const [, amountRaw, unit] = match;
  const amount = Number(amountRaw);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('JWT_SHIFT_TOKEN_TTL must be a positive duration');
  }

  const unitFactorSeconds: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  return amount * unitFactorSeconds[unit];
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const jwtSecret = env.JWT_SECRET?.trim();

  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required for agent authentication');
  }

  const rawTtl = env.JWT_SHIFT_TOKEN_TTL?.trim() ?? '8h';
  const rawRefreshTtl = env.JWT_REFRESH_TOKEN_TTL?.trim() ?? '30d';

  return {
    jwtSecret,
    jwtIssuer: env.JWT_ISSUER?.trim() || 'awawda-api',
    shiftTokenTtlSeconds: parseDurationToSeconds(rawTtl),
    refreshTokenTtlSeconds: parseDurationToSeconds(rawRefreshTtl),
  };
}
