import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { buildTestingCatalogItems } from '../catalog/data/testing-cuts-catalog';
import { TestingErpAdapter } from './testing-erp.adapter';

const CATALOG_ITEMS = buildTestingCatalogItems();

describe('TestingErpAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns healthy status', async () => {
    const adapter = new TestingErpAdapter();
    const health = await adapter.getHealth();
    expect(health).toEqual({
      provider: 'hashavshevet',
      status: 'up',
      detail: 'Testing ERP adapter — no live Hashavshevet connection.',
    });
  });

  it('returns a deterministic handoff response', async () => {
    const adapter = new TestingErpAdapter();
    const result = await adapter.handoffOrder({
      orderId: 'order-123',
      customerId: 'cust-1',
      lines: [{ itemId: 'itm-1', quantity: 2, unit: 'kg', clientUnitPrice: 10 }],
    });

    expect(result).toEqual({
      status: 'submitted',
      provider: 'hashavshevet',
      externalRef: 'testing:order-123',
      acceptedAt: '2026-05-01T10:00:00.000Z',
    });
  });

  it('returns a deterministic cancel response', async () => {
    const adapter = new TestingErpAdapter();
    const result = await adapter.cancelOrder({
      orderId: 'order-456',
      orderRef: 'ref-789',
      customerId: 'cust-1',
    });

    expect(result).toEqual({
      status: 'cancelled',
      provider: 'hashavshevet',
      externalRef: 'ref-789',
      canceledAt: '2026-05-01T10:00:00.000Z',
    });
  });

  it('returns demo assigned customers', async () => {
    const adapter = new TestingErpAdapter();
    const result = await adapter.getAssignedCustomers('agent-1');

    expect(result).toEqual({
      source: 'hashavshevet',
      syncedAt: '2026-05-01T10:00:00.000Z',
      customers: [{ customerId: 'cust-demo-001', isActive: true }],
    });
  });

  it('returns full testing catalog', async () => {
    const adapter = new TestingErpAdapter();
    const result = await adapter.getMasterCatalog();

    expect(result.source).toBe('hashavshevet');
    expect(result.items).toHaveLength(CATALOG_ITEMS.length);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: 'itm-beef-001' }),
      ]),
    );
  });

  it('returns two recent items from catalog', async () => {
    const adapter = new TestingErpAdapter();
    const result = await adapter.getCustomerRecentItems('cust-1');

    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.itemId).toBe(CATALOG_ITEMS[0]?.itemId);
    expect(result.items[1]?.itemId).toBe(CATALOG_ITEMS[1]?.itemId);
  });

  it('returns deterministic pricing for all catalog items', async () => {
    const adapter = new TestingErpAdapter();
    const result = await adapter.getCustomerPricing('cust-1');

    expect(result.version).toBe('price-list-cust-1');
    expect(result.lines).toHaveLength(CATALOG_ITEMS.length);
    expect(result.lines.every((line) => Number.isFinite(line.unitPrice) && line.unitPrice > 0)).toBe(true);
    expect(result.lines.every((line) => line.currency === 'ILS')).toBe(true);
  });

  it('returns empty arrays for optional report methods', async () => {
    const adapter = new TestingErpAdapter();

    const vendors = await adapter.getVendors();
    expect(vendors.vendors).toEqual([]);

    const specialPrices = await adapter.getSpecialPricesIndex();
    expect(specialPrices.lines).toEqual([]);

    const agents = await adapter.getAgents();
    expect(agents.agents).toEqual([]);

    const obligo = await adapter.getObligo();
    expect(obligo.entries).toEqual([]);

    const deliveryNotes = await adapter.getOpenDeliveryNotesList();
    expect(deliveryNotes.notes).toEqual([]);

    const customerDelivery = await adapter.getOpenDeliveryNotesByCustomer('cust-1');
    expect(customerDelivery.notes).toEqual([]);
    expect(customerDelivery.customerId).toBe('cust-1');

    const customerSpecial = await adapter.getCustomerSpecialPricing('cust-1');
    expect(customerSpecial.lines).toEqual([]);

    const balance = await adapter.getCustomerBalance('cust-1');
    expect(balance.entries).toEqual([]);

    const ledger = await adapter.getCustomerLedger('cust-1');
    expect(ledger.entries).toEqual([]);
    expect(ledger.customerId).toBe('cust-1');

    const stock = await adapter.getStockStatus();
    expect(stock.entries).toEqual([]);
  });

  it('all snapshots have source=hashavshevet', async () => {
    const adapter = new TestingErpAdapter();

    const vendors = await adapter.getVendors();
    expect(vendors.source).toBe('hashavshevet');

    const agents = await adapter.getAgents();
    expect(agents.source).toBe('hashavshevet');

    const stock = await adapter.getStockStatus();
    expect(stock.source).toBe('hashavshevet');
  });
});
