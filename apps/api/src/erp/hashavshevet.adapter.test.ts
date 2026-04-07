import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ERP_ERROR_CODES, ErpGatewayError } from './erp.errors';
import { HashavshevetAdapter } from './hashavshevet.adapter';

const HASH_ENV_KEYS = [
  'HASH_ENV',
  'HASH_API_URL',
  'HASH_TEST_API_URL',
  'HASH_PROD_API_URL',
  'HASH_API_KEY',
  'HASH_TEST_API_KEY',
  'HASH_PROD_API_KEY',
  'HASH_REQUEST_TIMEOUT_MS',
  'HASH_HEALTH_PATH',
  'HASH_ASSIGNED_CUSTOMERS_PATH',
  'HASH_CATALOG_PATH',
  'HASH_RECENT_ITEMS_PATH',
  'HASH_PRICING_PATH',
] as const;

describe.sequential('HashavshevetAdapter', () => {
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of HASH_ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();

    for (const key of HASH_ENV_KEYS) {
      const originalValue = originalEnv.get(key);
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }

    originalEnv.clear();
  });

  it('returns fallback snapshots when HASH URL is not configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const adapter = new HashavshevetAdapter();

    await expect(adapter.getHealth()).resolves.toEqual({
      provider: 'hashavshevet',
      status: 'degraded',
      detail: 'Hashavshevet live pull disabled (no HASH_API_URL/HASH_*_API_URL configured).',
    });
    await expect(adapter.getAssignedCustomers('agent-77')).resolves.toEqual({
      source: 'hashavshevet',
      syncedAt: '2026-05-01T10:00:00.000Z',
      customers: [{ customerId: 'cust-demo-001', isActive: true }],
    });
    await expect(adapter.getMasterCatalog()).resolves.toMatchObject({
      source: 'hashavshevet',
      syncedAt: '2026-05-01T10:00:00.000Z',
      items: expect.arrayContaining([
        expect.objectContaining({ itemId: 'itm-beef-entrecote' }),
        expect.objectContaining({ itemId: 'itm-beef-mince' }),
        expect.objectContaining({ itemId: 'itm-lamb-ribs' }),
      ]),
    });
    await expect(adapter.getCustomerRecentItems('cust-42')).resolves.toEqual({
      source: 'hashavshevet',
      syncedAt: '2026-05-01T10:00:00.000Z',
      items: [
        {
          itemId: 'recent-cust-42-1',
          name: 'Ribeye Steak',
          lastOrderedAt: '2026-05-01T10:00:00.000Z',
        },
        {
          itemId: 'recent-cust-42-2',
          name: 'Ground Beef Premium',
          lastOrderedAt: '2026-05-01T10:00:00.000Z',
        },
      ],
    });
    await expect(adapter.getCustomerPricing('cust-42')).resolves.toEqual({
      source: 'hashavshevet',
      syncedAt: '2026-05-01T10:00:00.000Z',
      version: 'price-list-cust-42',
      lines: [
        { itemId: 'itm-beef-entrecote', unitPrice: 109.9, currency: 'ILS' },
        { itemId: 'itm-lamb-ribs', unitPrice: 84.5, currency: 'ILS' },
      ],
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('surfaces stable ERP validation errors when response shape is invalid', async () => {
    process.env.HASH_API_URL = 'https://hash.example/api';
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(createJsonResponse({ unexpected: [] }))
      .mockResolvedValueOnce(createJsonResponse({ pricing: [{ id: 'itm-1' }] }))
      .mockResolvedValueOnce(createJsonResponse({ data: [{ id: 'itm-1' }] }));

    const adapter = new HashavshevetAdapter();

    await expectValidationError(
      adapter.getMasterCatalog(),
      'Hashavshevet payload must include one of: items, data.',
    );
    await expectValidationError(
      adapter.getCustomerPricing('cust-9'),
      'Hashavshevet payload is missing required numeric unitPrice.',
    );
    await expectValidationError(
      adapter.getCustomerRecentItems('cust-9'),
      'Hashavshevet payload is missing required name.',
    );
  });

  it('parses assigned/customers/catalog/recent/pricing snapshots from typical payload wrappers', async () => {
    process.env.HASH_API_URL = 'https://hash.example/api';

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        createJsonResponse({
          syncedAt: '2026-05-01T09:00:00.000Z',
          data: [
            { id: 'cust-1', active: false },
            { hashCustomerId: 311, enabled: true },
            { name: 'missing id' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          updatedAt: '2026-05-01T09:01:00.000Z',
          items: [{ id: 'itm-1', code: 'SKU-1', description: 'Brisket', uom: 'kilograms', active: false }],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          timestamp: '2026-05-01T09:02:00.000Z',
          data: [
            {
              id: 'itm-2',
              description: 'Short Ribs',
              lastPurchaseAt: '2026-04-25T15:30:00.000Z',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          syncedAt: '2026-05-01T09:03:00.000Z',
          priceListVersion: 'v-42',
          pricing: [{ id: 'itm-2', netPrice: '88.5', currency: 'USD' }],
        }),
      );

    const adapter = new HashavshevetAdapter();

    await expect(adapter.getAssignedCustomers('agent-11')).resolves.toEqual({
      source: 'hashavshevet',
      syncedAt: '2026-05-01T09:00:00.000Z',
      customers: [
        { customerId: 'cust-1', isActive: false },
        { customerId: '311', isActive: true },
      ],
    });
    await expect(adapter.getMasterCatalog()).resolves.toEqual({
      source: 'hashavshevet',
      syncedAt: '2026-05-01T09:01:00.000Z',
      items: [
        {
          itemId: 'itm-1',
          sku: 'SKU-1',
          name: 'Brisket',
          unit: 'kg',
          isActive: false,
        },
      ],
    });
    await expect(adapter.getCustomerRecentItems('cust-11')).resolves.toEqual({
      source: 'hashavshevet',
      syncedAt: '2026-05-01T09:02:00.000Z',
      items: [
        {
          itemId: 'itm-2',
          name: 'Short Ribs',
          lastOrderedAt: '2026-04-25T15:30:00.000Z',
        },
      ],
    });
    await expect(adapter.getCustomerPricing('cust-11')).resolves.toEqual({
      source: 'hashavshevet',
      syncedAt: '2026-05-01T09:03:00.000Z',
      version: 'v-42',
      lines: [{ itemId: 'itm-2', unitPrice: 88.5, currency: 'USD' }],
    });
  });
});

async function expectValidationError(promise: Promise<unknown>, message: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    code: ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
    message,
  } satisfies Partial<ErpGatewayError>);
}

function createJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
    ...init,
  });
}
