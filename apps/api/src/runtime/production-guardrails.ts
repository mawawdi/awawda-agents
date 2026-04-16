type HashEnvironment = 'testing' | 'production';

export function isNodeProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV?.trim().toLowerCase() === 'production';
}

export function resolveHashEnvironment(rawValue: string | undefined): HashEnvironment {
  const normalized = rawValue?.trim().toLowerCase();
  if (!normalized) {
    return 'testing';
  }

  if (normalized === 'testing' || normalized === 'production') {
    return normalized;
  }

  throw new Error('HASH_ENV must be either "testing" or "production".');
}

export function isProductionHashRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveHashEnvironment(env.HASH_ENV) === 'production';
}

export function isTestingSurfaceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !isProductionHashRuntime(env);
}

export function assertProductionRuntimeGuardrails(env: NodeJS.ProcessEnv = process.env): void {
  if (!isNodeProductionRuntime(env)) {
    return;
  }

  const hashEnvironment = resolveHashEnvironment(env.HASH_ENV);
  if (hashEnvironment !== 'production') {
    throw new Error('Production runtime requires HASH_ENV=production.');
  }

  const hasRestBaseUrl = hasNonEmptyValue(env.HASH_API_URL) || hasNonEmptyValue(env.HASH_PROD_API_URL);
  const hasRestApiKey = hasNonEmptyValue(env.HASH_API_KEY) || hasNonEmptyValue(env.HASH_PROD_API_KEY);
  const hconnectEnabled = resolveOptionalBoolean(env.HASH_HCONNECT_ENABLED) ?? false;
  const hasHconnectCredentials =
    hasNonEmptyValue(env.HASH_HCONNECT_STATION) &&
    hasNonEmptyValue(env.HASH_HCONNECT_COMPANY) &&
    hasNonEmptyValue(env.HASH_HCONNECT_NET_PASSPORT_ID) &&
    hasNonEmptyValue(env.HASH_HCONNECT_SIGNATURE_TOKEN);

  if (hconnectEnabled && !hasHconnectCredentials) {
    throw new Error(
      'Production runtime with HASH_HCONNECT_ENABLED=true requires HASH_HCONNECT_STATION, HASH_HCONNECT_COMPANY, HASH_HCONNECT_NET_PASSPORT_ID, and HASH_HCONNECT_SIGNATURE_TOKEN.',
    );
  }

  if (!hasRestBaseUrl && !(hconnectEnabled && hasHconnectCredentials)) {
    throw new Error(
      'Production runtime requires Hashavshevet production credentials. Configure HASH_API_URL/HASH_PROD_API_URL with key, or enable HASH_HCONNECT with full credentials.',
    );
  }

  if (hasRestBaseUrl && !hasRestApiKey && !(hconnectEnabled && hasHconnectCredentials)) {
    throw new Error(
      'Production runtime forbids unauthenticated Hashavshevet REST calls. Set HASH_API_KEY/HASH_PROD_API_KEY or enable HASH_HCONNECT with full credentials.',
    );
  }
}

function hasNonEmptyValue(rawValue: string | undefined): boolean {
  return (rawValue?.trim().length ?? 0) > 0;
}

function resolveOptionalBoolean(rawValue: string | undefined): boolean | null {
  if (!rawValue) {
    return null;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error('HASH_HCONNECT_ENABLED must be a boolean value when set.');
}
