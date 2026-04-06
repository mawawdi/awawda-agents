export interface SessionsConfig {
  customerSessionTtlSeconds: number;
}

const DURATION_PATTERN = /^(\d+)([smhd])$/;

function parseDurationToSeconds(rawDuration: string): number {
  const normalized = rawDuration.trim().toLowerCase();
  const match = DURATION_PATTERN.exec(normalized);

  if (!match) {
    throw new Error(
      'CUSTOMER_SESSION_TOKEN_TTL must be in the form <number>[s|m|h|d]. Example: 2h',
    );
  }

  const [, amountRaw, unit] = match;
  const amount = Number(amountRaw);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('CUSTOMER_SESSION_TOKEN_TTL must be a positive duration');
  }

  const unitFactorSeconds: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  return amount * unitFactorSeconds[unit];
}

export function loadSessionsConfig(env: NodeJS.ProcessEnv = process.env): SessionsConfig {
  const rawTtl = env.CUSTOMER_SESSION_TOKEN_TTL?.trim() ?? '2h';

  return {
    customerSessionTtlSeconds: parseDurationToSeconds(rawTtl),
  };
}
