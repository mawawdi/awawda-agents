import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildTestingCatalogItems } from '../catalog/data/testing-cuts-catalog';
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
  'HASH_HCONNECT_ENABLED',
  'HASH_HCONNECT_ENDPOINT_URL',
  'HASH_HCONNECT_STATION',
  'HASH_HCONNECT_COMPANY',
  'HASH_HCONNECT_NET_PASSPORT_ID',
  'HASH_HCONNECT_SIGNATURE_TOKEN',
  'HASH_HCONNECT_HANDOFF_PLUGIN',
  'HASH_HCONNECT_HANDOFF_DOCUMENT_ID',
  'HASH_HCONNECT_HANDOFF_ACCOUNT_KEY',
  'HASH_HCONNECT_REPORT_ASSIGNED_CUSTOMERS',
  'HASH_HCONNECT_REPORT_CATALOG',
  'HASH_HCONNECT_REPORT_RECENT_ITEMS',
  'HASH_HCONNECT_REPORT_PRICING',
  'HASH_HCONNECT_REPORT_ASSIGNED_CUSTOMERS_PARAMS_JSON',
  'HASH_HCONNECT_REPORT_CATALOG_PARAMS_JSON',
  'HASH_HCONNECT_REPORT_RECENT_ITEMS_PARAMS_JSON',
  'HASH_HCONNECT_REPORT_PRICING_PARAMS_JSON',
] as const;

const FALLBACK_CATALOG_ITEMS = buildTestingCatalogItems();
const [FALLBACK_PRIMARY_ITEM_ID, FALLBACK_SECONDARY_ITEM_ID] = (() => {
  const first = FALLBACK_CATALOG_ITEMS[0]?.itemId;
  const second = FALLBACK_CATALOG_ITEMS[1]?.itemId;
  const primary = first ?? 'itm-beef-001';
  const secondary = second ?? primary;
  return [primary, secondary];
})();
const [FALLBACK_PRIMARY_ITEM_NAME, FALLBACK_SECONDARY_ITEM_NAME] = (() => {
  const first = FALLBACK_CATALOG_ITEMS[0]?.name;
  const second = FALLBACK_CATALOG_ITEMS[1]?.name;
  const primary = first ?? fallbackNameFromItemId(FALLBACK_PRIMARY_ITEM_ID);
  const secondary = second ?? primary;
  return [primary, secondary];
})();

function fallbackNameFromItemId(itemId: string): string {
  return itemId
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

type HConnectPluginFamily = 'heshin' | 'kupain' | 'bankin' | 'itemin' | 'movein' | 'stockheaderin';
type CapabilityInvoker = {
  invokeCapabilityPlugin(family: HConnectPluginFamily, pluginData: unknown, pluginOverride?: string): Promise<unknown>;
};

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
        expect.objectContaining({ itemId: 'itm-beef-001' }),
        expect.objectContaining({ itemId: 'itm-beef-064' }),
        expect.objectContaining({ itemId: 'itm-lamb-009' }),
      ]),
    });
    await expect(adapter.getCustomerRecentItems('cust-42')).resolves.toEqual({
      source: 'hashavshevet',
      syncedAt: '2026-05-01T10:00:00.000Z',
      items: [
        {
          itemId: FALLBACK_PRIMARY_ITEM_ID,
          name: FALLBACK_PRIMARY_ITEM_NAME,
          lastOrderedAt: '2026-05-01T10:00:00.000Z',
        },
        {
          itemId: FALLBACK_SECONDARY_ITEM_ID,
          name: FALLBACK_SECONDARY_ITEM_NAME,
          lastOrderedAt: '2026-05-01T10:00:00.000Z',
        },
      ],
    });
    const pricingSnapshot = await adapter.getCustomerPricing('cust-42');
    expect(pricingSnapshot).toMatchObject({
      source: 'hashavshevet',
      syncedAt: '2026-05-01T10:00:00.000Z',
      version: 'price-list-cust-42',
    });
    expect(pricingSnapshot.lines).toHaveLength(FALLBACK_CATALOG_ITEMS.length);
    expect(pricingSnapshot.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: FALLBACK_PRIMARY_ITEM_ID, currency: 'ILS' }),
      expect.objectContaining({ itemId: FALLBACK_SECONDARY_ITEM_ID, currency: 'ILS' }),
    ]));
    expect(pricingSnapshot.lines.every((line) => Number.isFinite(line.unitPrice) && line.unitPrice > 0)).toBe(true);

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

  it('uses H-Connect reports flow when report mapping is configured', async () => {
    process.env.HASH_HCONNECT_ENABLED = 'true';
    process.env.HASH_HCONNECT_ENDPOINT_URL = 'https://ws.wizground.com/api';
    process.env.HASH_HCONNECT_STATION = 'station-1';
    process.env.HASH_HCONNECT_COMPANY = 'demo';
    process.env.HASH_HCONNECT_NET_PASSPORT_ID = '25555';
    process.env.HASH_HCONNECT_SIGNATURE_TOKEN = 'secret-token';
    process.env.HASH_HCONNECT_REPORT_ASSIGNED_CUSTOMERS = 'encrypted-report-token';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createJsonResponse({
        data: [
          { customerCode: 'cust-900', active: false },
          { cardCode: 77, enabled: true },
        ],
      }),
    );

    const adapter = new HashavshevetAdapter();

    await expect(adapter.getAssignedCustomers('agent-55')).resolves.toEqual({
      source: 'hashavshevet',
      syncedAt: '2026-05-01T10:00:00.000Z',
      customers: [
        { customerId: 'cust-900', isActive: false },
        { customerId: '77', isActive: true },
      ],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(calledUrl.toString()).toBe('https://ws.wizground.com/api');
    expect(calledInit.method).toBe('POST');
    const body = JSON.parse(String(calledInit.body)) as {
      station: string;
      plugin: string;
      company: string;
      message: { netPassportID: string; pluginData: { encrypt_reportData: string } };
      signature: string;
    };
    expect(body.station).toBe('station-1');
    expect(body.plugin).toBe('reports');
    expect(body.company).toBe('demo');
    expect(body.message.netPassportID).toBe('25555');
    expect(body.message.pluginData.encrypt_reportData).toBe('encrypted-report-token');
    expect(body.signature).toBe(
      createHash('md5')
        .update(`${JSON.stringify(body.message.pluginData)}secret-token`)
        .digest('hex'),
    );
  });

  it('uses H-Connect imovein plugin for order handoff', async () => {
    process.env.HASH_HCONNECT_ENABLED = 'true';
    process.env.HASH_HCONNECT_ENDPOINT_URL = 'https://ws.wizground.com/api';
    process.env.HASH_HCONNECT_STATION = 'station-2';
    process.env.HASH_HCONNECT_COMPANY = 'demo';
    process.env.HASH_HCONNECT_NET_PASSPORT_ID = '26666';
    process.env.HASH_HCONNECT_SIGNATURE_TOKEN = 'handoff-secret';
    process.env.HASH_HCONNECT_HANDOFF_PLUGIN = 'imovein';
    process.env.HASH_HCONNECT_HANDOFF_DOCUMENT_ID = '31';
    process.env.HASH_HCONNECT_HANDOFF_ACCOUNT_KEY = 'customer-override';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createJsonResponse({
        data: [{ reference: '123456789' }],
      }),
    );

    const adapter = new HashavshevetAdapter();

    await expect(
      adapter.handoffOrder({
        orderId: 'order-1234',
        customerId: 'cust-100',
        lines: [
          {
            itemId: 'item-1',
            quantity: 2.5,
            unit: 'kg',
            clientUnitPrice: 45.2,
          },
        ],
        notes: 'Test handoff',
      }),
    ).resolves.toMatchObject({
      status: 'submitted',
      provider: 'hashavshevet',
      externalRef: expect.any(String),
      acceptedAt: expect.any(String),
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, calledInit] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const body = JSON.parse(String(calledInit.body)) as {
      plugin: string;
      message: {
        pluginData: Array<Record<string, string>>;
      };
    };
    expect(body.plugin).toBe('imovein');
    expect(body.message.pluginData).toEqual([
      {
        accountKey: 'customer-override',
        documentid: '31',
        reference: '1234',
        itemkey: 'item-1',
        quantity: '2.500',
        price: '45.20',
        remarks: 'Test handoff',
      },
    ]);
  });

  it('uses H-Connect imovein plugin for order cancellation', async () => {
    process.env.HASH_HCONNECT_ENABLED = 'true';
    process.env.HASH_HCONNECT_ENDPOINT_URL = 'https://ws.wizground.com/api';
    process.env.HASH_HCONNECT_STATION = 'station-2';
    process.env.HASH_HCONNECT_COMPANY = 'demo';
    process.env.HASH_HCONNECT_NET_PASSPORT_ID = '26666';
    process.env.HASH_HCONNECT_SIGNATURE_TOKEN = 'handoff-secret';
    process.env.HASH_HCONNECT_HANDOFF_PLUGIN = 'imovein';
    process.env.HASH_HCONNECT_HANDOFF_DOCUMENT_ID = '31';
    process.env.HASH_HCONNECT_HANDOFF_ACCOUNT_KEY = 'customer-override';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createJsonResponse({
        data: [{ reference: '123456789' }],
      }),
    );

    const adapter = new HashavshevetAdapter();

    await expect(
      adapter.cancelOrder({
        orderId: 'order-1234',
        orderRef: 'ORD-1234',
        customerId: 'cust-100',
        reason: 'Customer requested cancellation',
      }),
    ).resolves.toMatchObject({
      status: 'cancelled',
      provider: 'hashavshevet',
      externalRef: expect.any(String),
      canceledAt: expect.any(String),
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, calledInit] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    const body = JSON.parse(String(calledInit.body)) as {
      plugin: string;
      message: {
        pluginData: Array<Record<string, string>>;
      };
    };
    expect(body.plugin).toBe('imovein');
    expect(body.message.pluginData).toEqual([
      {
        accountKey: 'customer-override',
        documentid: '31',
        reference: '1234',
        action: 'cancel',
        orderid: 'order-1234',
        orderref: 'ORD-1234',
        remarks: 'Customer requested cancellation',
      },
    ]);
  });

  it('fails fast with ERP_NOT_IMPLEMENTED when H-Connect handoff is disabled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const adapter = new HashavshevetAdapter();

    await expect(adapter.handoffOrder(createHandoffRequest())).rejects.toMatchObject({
      code: ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
    } satisfies Partial<ErpGatewayError>);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails fast on H-Connect auth errors without retry wrapping', async () => {
    process.env.HASH_HCONNECT_ENABLED = 'true';
    process.env.HASH_HCONNECT_ENDPOINT_URL = 'https://ws.wizground.com/api';
    process.env.HASH_HCONNECT_STATION = 'station-auth';
    process.env.HASH_HCONNECT_COMPANY = 'demo';
    process.env.HASH_HCONNECT_NET_PASSPORT_ID = '29999';
    process.env.HASH_HCONNECT_SIGNATURE_TOKEN = 'auth-secret';
    process.env.HASH_HCONNECT_HANDOFF_PLUGIN = 'imovein';

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(createJsonResponse({ message: 'bad auth' }, { status: 401 }));
    const adapter = new HashavshevetAdapter();

    await expect(adapter.handoffOrder(createHandoffRequest())).rejects.toMatchObject({
      code: ERP_ERROR_CODES.ERP_AUTH_FAILED,
    } satisfies Partial<ErpGatewayError>);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries transient handoff failures and wraps final error', async () => {
    process.env.HASH_HCONNECT_ENABLED = 'true';
    process.env.HASH_HCONNECT_ENDPOINT_URL = 'https://ws.wizground.com/api';
    process.env.HASH_HCONNECT_STATION = 'station-retry';
    process.env.HASH_HCONNECT_COMPANY = 'demo';
    process.env.HASH_HCONNECT_NET_PASSPORT_ID = '30000';
    process.env.HASH_HCONNECT_SIGNATURE_TOKEN = 'retry-secret';
    process.env.HASH_HCONNECT_HANDOFF_PLUGIN = 'imovein';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const adapter = new HashavshevetAdapter();

    const handoffPromise = adapter.handoffOrder(createHandoffRequest());
    const handoffAssertion = expect(handoffPromise).rejects.toMatchObject({
      code: ERP_ERROR_CODES.ERP_ORDER_HANDOFF_FAILED,
      cause: expect.objectContaining({
        code: ERP_ERROR_CODES.ERP_UNAVAILABLE,
      }),
    } satisfies Partial<ErpGatewayError>);
    await vi.runAllTimersAsync();

    await handoffAssertion;
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('routes extended H-Connect plugin capabilities via envelope transport', async () => {
    process.env.HASH_HCONNECT_ENABLED = 'true';
    process.env.HASH_HCONNECT_ENDPOINT_URL = 'https://ws.wizground.com/api';
    process.env.HASH_HCONNECT_STATION = 'station-cap';
    process.env.HASH_HCONNECT_COMPANY = 'demo';
    process.env.HASH_HCONNECT_NET_PASSPORT_ID = '27777';
    process.env.HASH_HCONNECT_SIGNATURE_TOKEN = 'capability-secret';

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => createJsonResponse({ data: [{ ok: true }] }));
    const adapter = new HashavshevetAdapter() as unknown as CapabilityInvoker;

    const pluginCalls: Array<{ family: HConnectPluginFamily; expectedPlugin: string; pluginData: unknown }> = [
      { family: 'heshin', expectedPlugin: 'iheshin', pluginData: { scope: 'health' } },
      { family: 'kupain', expectedPlugin: 'ikupain', pluginData: { coupon: 'SUMMER' } },
      { family: 'bankin', expectedPlugin: 'ibankin', pluginData: [{ statement: 1 }] },
      { family: 'itemin', expectedPlugin: 'iitemin', pluginData: { itemKey: 'itm-1' } },
      { family: 'movein', expectedPlugin: 'imovein', pluginData: [{ reference: '1234' }] },
      { family: 'stockheaderin', expectedPlugin: 'istockheaderin', pluginData: { warehouse: 'main' } },
    ];

    for (const pluginCall of pluginCalls) {
      await adapter.invokeCapabilityPlugin(pluginCall.family, pluginCall.pluginData);
    }

    expect(fetchSpy).toHaveBeenCalledTimes(pluginCalls.length);
    for (const [index, pluginCall] of pluginCalls.entries()) {
      const [, calledInit] = fetchSpy.mock.calls[index] as [URL, RequestInit];
      const body = JSON.parse(String(calledInit.body)) as {
        station: string;
        plugin: string;
        company: string;
        message: { netPassportID: string; pluginData: unknown };
        signature: string;
      };
      expect(body.station).toBe('station-cap');
      expect(body.company).toBe('demo');
      expect(body.message.netPassportID).toBe('27777');
      expect(body.plugin).toBe(pluginCall.expectedPlugin);
      expect(body.message.pluginData).toEqual(pluginCall.pluginData);
      expect(body.signature).toBe(
        createHash('md5')
          .update(`${JSON.stringify(pluginCall.pluginData)}capability-secret`)
          .digest('hex'),
      );
    }
  });

  it('surfaces stable ERP errors for plugin capability failures', async () => {
    process.env.HASH_HCONNECT_ENABLED = 'true';
    process.env.HASH_HCONNECT_ENDPOINT_URL = 'https://ws.wizground.com/api';
    process.env.HASH_HCONNECT_STATION = 'station-cap';
    process.env.HASH_HCONNECT_COMPANY = 'demo';
    process.env.HASH_HCONNECT_NET_PASSPORT_ID = '28888';

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const adapterWithoutSignature = new HashavshevetAdapter() as unknown as CapabilityInvoker;
    await expect(
      adapterWithoutSignature.invokeCapabilityPlugin('bankin', { payload: true }),
    ).rejects.toMatchObject({
      code: ERP_ERROR_CODES.ERP_AUTH_FAILED,
      message: 'HASH_HCONNECT_SIGNATURE_TOKEN is required for H-Connect plugin requests.',
    } satisfies Partial<ErpGatewayError>);
    expect(fetchSpy).not.toHaveBeenCalled();

    process.env.HASH_HCONNECT_SIGNATURE_TOKEN = 'capability-secret';
    const adapterWithInvalidOverride = new HashavshevetAdapter() as unknown as CapabilityInvoker;
    await expect(
      adapterWithInvalidOverride.invokeCapabilityPlugin('itemin', { payload: true }, '   '),
    ).rejects.toMatchObject({
      code: ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
      message: 'Hashavshevet plugin override for itemin cannot be empty.',
    } satisfies Partial<ErpGatewayError>);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to REST when H-Connect is enabled but specific report is not configured', async () => {
    process.env.HASH_HCONNECT_ENABLED = 'true';
    process.env.HASH_HCONNECT_ENDPOINT_URL = 'https://ws.wizground.com/api';
    process.env.HASH_HCONNECT_STATION = 'station-fallback';
    process.env.HASH_HCONNECT_COMPANY = 'demo';
    process.env.HASH_HCONNECT_NET_PASSPORT_ID = '31111';
    process.env.HASH_HCONNECT_SIGNATURE_TOKEN = 'fallback-secret';
    // NOTE: No report configurations set, so all reports should fall back to REST

    process.env.HASH_API_URL = 'https://hash.example/api';

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        createJsonResponse({
          data: [{ id: 'cust-fallback-1', active: true }],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          items: [{ id: 'itm-fallback', code: 'SKU-FB', description: 'Fallback Item', uom: 'kg', active: true }],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          data: [
            {
              id: 'itm-fallback-recent',
              description: 'Recent Fallback Item',
              lastPurchaseAt: '2026-04-30T12:00:00.000Z',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          pricing: [{ id: 'itm-fallback-price', netPrice: '99.5', currency: 'ILS' }],
        }),
      );

    const adapter = new HashavshevetAdapter();

    // All methods should use REST path, not H-Connect
    await expect(adapter.getAssignedCustomers('agent-fallback')).resolves.toMatchObject({
      source: 'hashavshevet',
      customers: expect.arrayContaining([
        expect.objectContaining({ customerId: 'cust-fallback-1', isActive: true }),
      ]),
    });

    await expect(adapter.getMasterCatalog()).resolves.toMatchObject({
      source: 'hashavshevet',
      items: expect.arrayContaining([
        expect.objectContaining({ itemId: 'itm-fallback' }),
      ]),
    });

    await expect(adapter.getCustomerRecentItems('cust-fallback')).resolves.toMatchObject({
      source: 'hashavshevet',
      items: expect.arrayContaining([
        expect.objectContaining({ itemId: 'itm-fallback-recent' }),
      ]),
    });

    await expect(adapter.getCustomerPricing('cust-fallback')).resolves.toMatchObject({
      source: 'hashavshevet',
      lines: expect.arrayContaining([
        expect.objectContaining({ itemId: 'itm-fallback-price' }),
      ]),
    });
  });

  it('falls back to snapshot when H-Connect enabled but report not configured AND REST is disabled', async () => {
    process.env.HASH_HCONNECT_ENABLED = 'true';
    process.env.HASH_HCONNECT_ENDPOINT_URL = 'https://ws.wizground.com/api';
    process.env.HASH_HCONNECT_STATION = 'station-snapshot';
    process.env.HASH_HCONNECT_COMPANY = 'demo';
    process.env.HASH_HCONNECT_NET_PASSPORT_ID = '32222';
    process.env.HASH_HCONNECT_SIGNATURE_TOKEN = 'snapshot-secret';
    // NOTE: No report configurations and no REST_ENABLED, should use snapshots

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const adapter = new HashavshevetAdapter();

    const assignedCustomersResult = await adapter.getAssignedCustomers('agent-snap');
    expect(assignedCustomersResult).toEqual({
      source: 'hashavshevet',
      syncedAt: '2026-05-01T10:00:00.000Z',
      customers: [{ customerId: 'cust-demo-001', isActive: true }],
    });

    const catalogResult = await adapter.getMasterCatalog();
    expect(catalogResult).toMatchObject({
      source: 'hashavshevet',
      syncedAt: '2026-05-01T10:00:00.000Z',
      items: expect.arrayContaining([
        expect.objectContaining({ itemId: 'itm-beef-001' }),
      ]),
    });

    const recentResult = await adapter.getCustomerRecentItems('cust-snap');
    expect(recentResult).toEqual({
      source: 'hashavshevet',
      syncedAt: '2026-05-01T10:00:00.000Z',
      items: [
        {
          itemId: FALLBACK_PRIMARY_ITEM_ID,
          name: FALLBACK_PRIMARY_ITEM_NAME,
          lastOrderedAt: '2026-05-01T10:00:00.000Z',
        },
        {
          itemId: FALLBACK_SECONDARY_ITEM_ID,
          name: FALLBACK_SECONDARY_ITEM_NAME,
          lastOrderedAt: '2026-05-01T10:00:00.000Z',
        },
      ],
    });

    const pricingResult = await adapter.getCustomerPricing('cust-snap');
    expect(pricingResult).toMatchObject({
      source: 'hashavshevet',
      syncedAt: '2026-05-01T10:00:00.000Z',
      version: 'price-list-cust-snap',
    });
    expect(pricingResult.lines).toHaveLength(FALLBACK_CATALOG_ITEMS.length);
    expect(pricingResult.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: FALLBACK_PRIMARY_ITEM_ID, currency: 'ILS' }),
      expect.objectContaining({ itemId: FALLBACK_SECONDARY_ITEM_ID, currency: 'ILS' }),
    ]));
    expect(pricingResult.lines.every((line) => Number.isFinite(line.unitPrice) && line.unitPrice > 0)).toBe(true);

    // No HTTP calls should have been made since we used snapshots
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses H-Connect report for one method and falls back to REST for another', async () => {
    process.env.HASH_HCONNECT_ENABLED = 'true';
    process.env.HASH_HCONNECT_ENDPOINT_URL = 'https://ws.wizground.com/api';
    process.env.HASH_HCONNECT_STATION = 'station-mixed';
    process.env.HASH_HCONNECT_COMPANY = 'demo';
    process.env.HASH_HCONNECT_NET_PASSPORT_ID = '33333';
    process.env.HASH_HCONNECT_SIGNATURE_TOKEN = 'mixed-secret';
    process.env.HASH_HCONNECT_REPORT_ASSIGNED_CUSTOMERS = 'encrypted-cust';
    // NOTE: Only assigned customers report configured, others will fall back to REST

    process.env.HASH_API_URL = 'https://hash.example/api';

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy
      .mockResolvedValueOnce(
        createJsonResponse({
          data: [{ customerCode: 'cust-hc-1', active: true }],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          items: [{ id: 'itm-rest-1', code: 'SKU-REST', description: 'REST Item', uom: 'kg', active: true }],
        }),
      );

    const adapter = new HashavshevetAdapter();

    // Should use H-Connect for assigned customers
    await expect(adapter.getAssignedCustomers('agent-mixed')).resolves.toMatchObject({
      source: 'hashavshevet',
      customers: expect.arrayContaining([
        expect.objectContaining({ customerId: 'cust-hc-1' }),
      ]),
    });

    // Should fall back to REST for catalog
    await expect(adapter.getMasterCatalog()).resolves.toMatchObject({
      source: 'hashavshevet',
      items: expect.arrayContaining([
        expect.objectContaining({ itemId: 'itm-rest-1' }),
      ]),
    });

    // First call should be H-Connect (assigned customers report)
    // Second call should be REST (catalog)
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

function createHandoffRequest() {
  return {
    orderId: 'order-1234',
    customerId: 'cust-100',
    lines: [
      {
        itemId: 'item-1',
        quantity: 2.5,
        unit: 'kg' as const,
        clientUnitPrice: 45.2,
      },
    ],
    notes: 'Test handoff',
  };
}

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
