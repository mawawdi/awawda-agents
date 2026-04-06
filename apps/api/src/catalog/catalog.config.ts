const DEFAULT_CACHE_TTL_SECONDS = 300;

export type CatalogConfig = {
  cacheTtlSeconds: number;
};

export function loadCatalogConfig(env: NodeJS.ProcessEnv = process.env): CatalogConfig {
  const rawTtl = env.CATALOG_CACHE_TTL_SECONDS;

  if (!rawTtl) {
    return {
      cacheTtlSeconds: DEFAULT_CACHE_TTL_SECONDS,
    };
  }

  const parsed = Number(rawTtl);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('CATALOG_CACHE_TTL_SECONDS must be a positive integer');
  }

  return {
    cacheTtlSeconds: parsed,
  };
}
