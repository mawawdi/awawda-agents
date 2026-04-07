import { Injectable } from '@nestjs/common';

import { ERP_ERROR_CODES, ErpGatewayError } from './erp.errors';
import type {
  ErpGatewayAssignedCustomersSnapshot,
  ErpGatewayCatalogSnapshot,
  ErpGatewayCustomerPricingSnapshot,
  ErpGatewayCustomerRecentItemsSnapshot,
  ErpGatewayHealth,
  ErpOrderHandoffRequest,
  ErpOrderHandoffResponse,
} from './erp.gateway';

type RetryPolicy = {
  maxAttempts: number;
  initialBackoffMs: number;
};

type HashEnvironment = 'testing' | 'production';

type HashavshevetConfig = {
  environment: HashEnvironment;
  enabled: boolean;
  baseUrl: string;
  apiKey: string | null;
  requestTimeoutMs: number;
  healthPath: string;
  assignedCustomersPath: string;
  catalogPath: string;
  recentItemsPath: string;
  pricingPath: string;
};

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialBackoffMs: 200,
};

const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_HASH_ENVIRONMENT: HashEnvironment = 'testing';
const DEFAULT_HEALTH_PATH = '/health';
const DEFAULT_ASSIGNED_CUSTOMERS_PATH = '/agents/{agentId}/customers';
const DEFAULT_CATALOG_PATH = '/catalog/items';
const DEFAULT_RECENT_ITEMS_PATH = '/customers/{customerId}/recent-items';
const DEFAULT_PRICING_PATH = '/customers/{customerId}/pricing';

@Injectable()
export class HashavshevetAdapter {
  private readonly config = loadHashavshevetConfig();
  private readonly retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY;

  async handoffOrder(_request: ErpOrderHandoffRequest): Promise<ErpOrderHandoffResponse> {
    return this.withRetry('hashavshevet.handoffOrder', async () => {
      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
        'Hashavshevet adapter skeleton is wired, but live transport is not configured yet.',
      );
    });
  }

  async getHealth(): Promise<ErpGatewayHealth> {
    if (!this.config.enabled) {
      return {
        provider: 'hashavshevet',
        status: 'degraded',
        detail: 'Hashavshevet live pull disabled (no HASH_API_URL/HASH_*_API_URL configured).',
      };
    }

    try {
      const payload = await this.fetchJsonRecord(this.resolveEndpoint(this.config.healthPath));
      const normalizedStatus = normalizeHealthStatus(readOptionalString(payload, ['status', 'health']));

      return {
        provider: 'hashavshevet',
        status: normalizedStatus,
        detail:
          readOptionalString(payload, ['detail', 'message']) ??
          `Hashavshevet ${this.config.environment} endpoint is reachable.`,
      };
    } catch (error) {
      return {
        provider: 'hashavshevet',
        status: 'down',
        detail:
          error instanceof ErpGatewayError
            ? error.message
            : 'Hashavshevet health probe failed with an unknown error.',
      };
    }
  }

  async getAssignedCustomers(agentId: string): Promise<ErpGatewayAssignedCustomersSnapshot> {
    if (!this.config.enabled) {
      return {
        source: 'hashavshevet',
        syncedAt: new Date().toISOString(),
        customers: [
          {
            customerId: 'cust-demo-001',
            isActive: true,
          },
        ],
      };
    }

    const payload = await this.fetchJson(this.resolveEndpoint(this.config.assignedCustomersPath, { agentId }));
    const entries = mapPayloadArrayLoose(payload, ['customers', 'data']);
    const customers = entries.flatMap((entry) => {
      const customerId = readOptionalIdentifier(entry, [
        'customerId',
        'id',
        'hashCustomerId',
        'customerCode',
        'customerNumber',
        'cardCode',
      ]);

      if (!customerId) {
        return [];
      }

      return [
        {
          customerId,
          isActive: readOptionalBoolean(entry, ['isActive', 'active', 'enabled']) ?? true,
        },
      ];
    });

    return {
      source: 'hashavshevet',
      syncedAt: resolveSyncedAt(payload),
      customers,
    };
  }

  async getMasterCatalog(): Promise<ErpGatewayCatalogSnapshot> {
    if (!this.config.enabled) {
      return {
        source: 'hashavshevet',
        syncedAt: new Date().toISOString(),
        items: [
          {
            itemId: 'itm-beef-entrecote',
            sku: 'BEEF-ENT-001',
            name: 'Beef Entrecôte',
            unit: 'kg',
            isActive: true,
          },
          {
            itemId: 'itm-beef-mince',
            sku: 'BEEF-MIN-010',
            name: 'Beef Mince 20% Fat',
            unit: 'kg',
            isActive: true,
          },
          {
            itemId: 'itm-lamb-ribs',
            sku: 'LAMB-RIB-002',
            name: 'Lamb Ribs',
            unit: 'kg',
            isActive: true,
          },
        ],
      };
    }

    const payload = await this.fetchJson(this.resolveEndpoint(this.config.catalogPath));
    const items = mapPayloadArray(payload, ['items', 'data']).map((entry) => ({
      itemId: readRequiredString(entry, ['itemId', 'id'], 'itemId'),
      sku: readRequiredString(entry, ['sku', 'code'], 'sku'),
      name: readRequiredString(entry, ['name', 'description'], 'name'),
      unit: normalizeUnit(readRequiredString(entry, ['unit', 'uom'], 'unit')),
      isActive: readOptionalBoolean(entry, ['isActive', 'active']) ?? true,
    }));

    return {
      source: 'hashavshevet',
      syncedAt: resolveSyncedAt(payload),
      items,
    };
  }

  async getCustomerRecentItems(customerId: string): Promise<ErpGatewayCustomerRecentItemsSnapshot> {
    if (!this.config.enabled) {
      const now = new Date().toISOString();

      return {
        source: 'hashavshevet',
        syncedAt: now,
        items: [
          {
            itemId: `recent-${customerId}-1`,
            name: 'Ribeye Steak',
            lastOrderedAt: now,
          },
          {
            itemId: `recent-${customerId}-2`,
            name: 'Ground Beef Premium',
            lastOrderedAt: now,
          },
        ],
      };
    }

    const payload = await this.fetchJson(
      this.resolveEndpoint(this.config.recentItemsPath, {
        customerId,
      }),
    );
    const now = new Date().toISOString();
    const items = mapPayloadArray(payload, ['items', 'data']).map((entry) => {
      const lastOrderedAtRaw = readOptionalString(entry, ['lastOrderedAt', 'orderedAt', 'lastPurchaseAt']);
      return {
        itemId: readRequiredString(entry, ['itemId', 'id'], 'itemId'),
        name: readRequiredString(entry, ['name', 'description'], 'name'),
        lastOrderedAt: normalizeIsoTimestamp(lastOrderedAtRaw, now),
      };
    });

    return {
      source: 'hashavshevet',
      syncedAt: resolveSyncedAt(payload),
      items,
    };
  }

  async getCustomerPricing(customerId: string): Promise<ErpGatewayCustomerPricingSnapshot> {
    if (!this.config.enabled) {
      const now = new Date().toISOString();

      return {
        source: 'hashavshevet',
        syncedAt: now,
        version: `price-list-${customerId}`,
        lines: [
          {
            itemId: 'itm-beef-entrecote',
            unitPrice: 109.9,
            currency: 'ILS',
          },
          {
            itemId: 'itm-lamb-ribs',
            unitPrice: 84.5,
            currency: 'ILS',
          },
        ],
      };
    }

    const payload = await this.fetchJson(
      this.resolveEndpoint(this.config.pricingPath, {
        customerId,
      }),
    );
    const now = new Date().toISOString();
    const payloadRecord = extractRecord(payload);
    const lines = mapPayloadArray(payload, ['lines', 'pricing', 'data']).map((entry) => ({
      itemId: readRequiredString(entry, ['itemId', 'id'], 'itemId'),
      unitPrice: readRequiredNumber(entry, ['unitPrice', 'price', 'netPrice'], 'unitPrice'),
      currency: readOptionalString(entry, ['currency']) ?? 'ILS',
    }));

    return {
      source: 'hashavshevet',
      syncedAt: resolveSyncedAt(payload),
      version:
        payloadRecord !== null
          ? readOptionalString(payloadRecord, ['version', 'priceListVersion']) ?? `price-list-${customerId}`
          : `price-list-${customerId}`,
      lines,
    };
  }

  private async withRetry<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    let delayMs = this.retryPolicy.initialBackoffMs;

    for (let attempt = 1; attempt <= this.retryPolicy.maxAttempts; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        const isLastAttempt = attempt === this.retryPolicy.maxAttempts;
        if (isLastAttempt) {
          throw new ErpGatewayError(
            ERP_ERROR_CODES.ERP_ORDER_HANDOFF_FAILED,
            `${operation} failed after ${attempt} attempts.`,
            error,
          );
        }

        await sleep(delayMs);
        delayMs *= 2;
      }
    }

    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_ORDER_HANDOFF_FAILED,
      `${operation} failed unexpectedly.`,
    );
  }

  private resolveEndpoint(pathTemplate: string, params: Record<string, string> = {}): URL {
    const endpoint = interpolatePath(pathTemplate, params);
    const baseUrl = this.config.baseUrl.endsWith('/') ? this.config.baseUrl : `${this.config.baseUrl}/`;
    return new URL(endpoint.replace(/^\/+/, ''), baseUrl);
  }

  private async fetchJson(endpoint: URL): Promise<unknown> {
    const response = await this.fetchResponse(endpoint);
    return parseJsonResponse(response, endpoint);
  }

  private async fetchJsonRecord(endpoint: URL): Promise<Record<string, unknown>> {
    return assertRecord(await this.fetchJson(endpoint), 'Hashavshevet response');
  }

  private async fetchResponse(endpoint: URL): Promise<Response> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.config.requestTimeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: buildHeaders(this.config.apiKey),
        signal: controller.signal,
      });

      if (response.ok) {
        return response;
      }

      if (response.status === 401 || response.status === 403) {
        throw new ErpGatewayError(
          ERP_ERROR_CODES.ERP_AUTH_FAILED,
          `Hashavshevet authentication failed (${response.status}) for ${endpoint.pathname}.`,
        );
      }

      if (response.status >= 500) {
        throw new ErpGatewayError(
          ERP_ERROR_CODES.ERP_UNAVAILABLE,
          `Hashavshevet is unavailable (${response.status}) for ${endpoint.pathname}.`,
        );
      }

      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
        `Hashavshevet returned an unexpected response (${response.status}) for ${endpoint.pathname}.`,
      );
    } catch (error) {
      if (error instanceof ErpGatewayError) {
        throw error;
      }

      if (isAbortError(error)) {
        throw new ErpGatewayError(
          ERP_ERROR_CODES.ERP_TIMEOUT,
          `Hashavshevet request timed out after ${this.config.requestTimeoutMs}ms.`,
          error,
        );
      }

      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_UNAVAILABLE,
        `Hashavshevet request failed for ${endpoint.pathname}.`,
        error,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function loadHashavshevetConfig(env: NodeJS.ProcessEnv = process.env): HashavshevetConfig {
  const environment = resolveHashEnvironment(env.HASH_ENV);
  const baseUrl = resolveBaseUrl(environment, env);
  const apiKey = resolveApiKey(environment, env);

  return {
    environment,
    enabled: baseUrl.length > 0,
    baseUrl,
    apiKey,
    requestTimeoutMs: resolvePositiveInteger(env.HASH_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
    healthPath: env.HASH_HEALTH_PATH?.trim() || DEFAULT_HEALTH_PATH,
    assignedCustomersPath: env.HASH_ASSIGNED_CUSTOMERS_PATH?.trim() || DEFAULT_ASSIGNED_CUSTOMERS_PATH,
    catalogPath: env.HASH_CATALOG_PATH?.trim() || DEFAULT_CATALOG_PATH,
    recentItemsPath: env.HASH_RECENT_ITEMS_PATH?.trim() || DEFAULT_RECENT_ITEMS_PATH,
    pricingPath: env.HASH_PRICING_PATH?.trim() || DEFAULT_PRICING_PATH,
  };
}

function resolveHashEnvironment(rawEnvironment: string | undefined): HashEnvironment {
  const normalized = rawEnvironment?.trim().toLowerCase();
  return normalized === 'production' ? 'production' : DEFAULT_HASH_ENVIRONMENT;
}

function resolveBaseUrl(environment: HashEnvironment, env: NodeJS.ProcessEnv): string {
  const explicit = env.HASH_API_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const byEnvironment =
    environment === 'production' ? env.HASH_PROD_API_URL?.trim() : env.HASH_TEST_API_URL?.trim();
  return byEnvironment ?? '';
}

function resolveApiKey(environment: HashEnvironment, env: NodeJS.ProcessEnv): string | null {
  const explicit = env.HASH_API_KEY?.trim();
  if (explicit) {
    return explicit;
  }

  const byEnvironment =
    environment === 'production' ? env.HASH_PROD_API_KEY?.trim() : env.HASH_TEST_API_KEY?.trim();
  return byEnvironment && byEnvironment.length > 0 ? byEnvironment : null;
}

function resolvePositiveInteger(rawValue: string | undefined, fallback: number): number {
  if (!rawValue || rawValue.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('HASH_REQUEST_TIMEOUT_MS must be a positive integer');
  }

  return parsed;
}

function buildHeaders(apiKey: string | null): HeadersInit {
  if (!apiKey) {
    return {
      accept: 'application/json',
    };
  }

  return {
    accept: 'application/json',
    'x-api-key': apiKey,
    authorization: `Bearer ${apiKey}`,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function parseJsonResponse(response: Response, endpoint: URL): Promise<unknown> {
  return response
    .text()
    .then((body) => {
      if (body.trim().length === 0) {
        return {};
      }

      try {
        return JSON.parse(body) as unknown;
      } catch (error) {
        throw new ErpGatewayError(
          ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
          `Hashavshevet returned invalid JSON for ${endpoint.pathname}.`,
          error,
        );
      }
    });
}

function normalizeHealthStatus(rawStatus: string | null): ErpGatewayHealth['status'] {
  if (!rawStatus) {
    return 'up';
  }

  const normalized = rawStatus.trim().toLowerCase();
  if (normalized === 'up' || normalized === 'healthy' || normalized === 'ok') {
    return 'up';
  }

  if (normalized === 'degraded' || normalized === 'warning') {
    return 'degraded';
  }

  return 'down';
}

function normalizeUnit(rawUnit: string): 'kg' | 'unit' {
  const normalized = rawUnit.trim().toLowerCase();
  if (normalized === 'kg' || normalized === 'kilogram' || normalized === 'kilograms') {
    return 'kg';
  }

  return 'unit';
}

function resolveSyncedAt(payload: unknown): string {
  const record = extractRecord(payload);
  if (!record) {
    return new Date().toISOString();
  }

  const explicit = readOptionalString(record, ['syncedAt', 'updatedAt', 'timestamp']);
  return normalizeIsoTimestamp(explicit, new Date().toISOString());
}

function normalizeIsoTimestamp(rawValue: string | null, fallback: string): string {
  if (!rawValue) {
    return fallback;
  }

  const timestamp = Date.parse(rawValue);
  if (Number.isNaN(timestamp)) {
    return fallback;
  }

  return new Date(timestamp).toISOString();
}

function mapPayloadArrayLoose(payload: unknown, keys: string[]): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.flatMap((entry) => {
      const record = extractRecord(entry);
      return record ? [record] : [];
    });
  }

  const record = extractRecord(payload);
  if (!record) {
    return [];
  }

  for (const key of keys) {
    const candidate = record[key];
    if (!Array.isArray(candidate)) {
      continue;
    }

    return candidate.flatMap((entry) => {
      const mappedRecord = extractRecord(entry);
      return mappedRecord ? [mappedRecord] : [];
    });
  }

  return [];
}

function mapPayloadArray(payload: unknown, keys: string[]): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((entry) => assertRecord(entry, 'Hashavshevet array entry'));
  }

  const record = assertRecord(payload, 'Hashavshevet response');
  for (const key of keys) {
    const candidate = record[key];
    if (!Array.isArray(candidate)) {
      continue;
    }

    return candidate.map((entry) => assertRecord(entry, `Hashavshevet ${key} entry`));
  }

  throw new ErpGatewayError(
    ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
    `Hashavshevet payload must include one of: ${keys.join(', ')}.`,
  );
}

function extractRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  const record = extractRecord(value);
  if (!record) {
    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
      `${label} must be a JSON object.`,
    );
  }

  return record;
}

function readRequiredString(
  record: Record<string, unknown>,
  keys: string[],
  label: string,
): string {
  const value = readOptionalString(record, keys);
  if (!value) {
    throw new ErpGatewayError(
      ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
      `Hashavshevet payload is missing required ${label}.`,
    );
  }

  return value;
}

function readOptionalIdentifier(record: Record<string, unknown>, keys: string[]): string | null {
  const fromString = readOptionalString(record, keys);
  if (fromString) {
    return fromString;
  }

  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }

  return null;
}

function readOptionalString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function readOptionalBoolean(record: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'boolean') {
      return candidate;
    }

    if (typeof candidate === 'number') {
      if (candidate === 1) {
        return true;
      }

      if (candidate === 0) {
        return false;
      }
    }

    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toLowerCase();
      if (['true', 't', 'yes', 'y', '1', 'active'].includes(normalized)) {
        return true;
      }

      if (['false', 'f', 'no', 'n', '0', 'inactive'].includes(normalized)) {
        return false;
      }
    }
  }

  return null;
}

function readRequiredNumber(record: Record<string, unknown>, keys: string[], label: string): number {
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  throw new ErpGatewayError(
    ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
    `Hashavshevet payload is missing required numeric ${label}.`,
  );
}

function interpolatePath(pathTemplate: string, params: Record<string, string>): string {
  return pathTemplate.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = params[key];
    if (!value) {
      throw new ErpGatewayError(
        ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
        `Hashavshevet path parameter "${key}" is required.`,
      );
    }

    return encodeURIComponent(value);
  });
}
