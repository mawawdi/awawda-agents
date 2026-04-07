export interface SessionsConfig {
  customerSessionTtlSeconds: number;
  activationRateLimitBurst: number;
  activationRateLimitWindowSeconds: number;
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
  const activationRateLimitBurst = parsePositiveInteger(
    env.CUSTOMER_SESSION_ACTIVATION_RATE_LIMIT_BURST,
    'CUSTOMER_SESSION_ACTIVATION_RATE_LIMIT_BURST',
    5,
  );
  const activationRateLimitWindowSeconds = parsePositiveInteger(
    env.CUSTOMER_SESSION_ACTIVATION_RATE_LIMIT_WINDOW_SECONDS,
    'CUSTOMER_SESSION_ACTIVATION_RATE_LIMIT_WINDOW_SECONDS',
    60,
  );

  return {
    customerSessionTtlSeconds: parseDurationToSeconds(rawTtl),
    activationRateLimitBurst,
    activationRateLimitWindowSeconds,
  };
}

function parsePositiveInteger(rawValue: string | undefined, key: string, fallback: number): number {
  if (rawValue === undefined || rawValue.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }

  return parsed;
}
