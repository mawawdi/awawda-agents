import { Injectable } from '@nestjs/common';

import { buildTestingCatalogItems } from '../catalog/data/testing-cuts-catalog';
import type {
  ErpGateway,
  ErpGatewayAgentsSnapshot,
  ErpGatewayAssignedCustomersSnapshot,
  ErpGatewayCatalogSnapshot,
  ErpGatewayCustomerBalanceSnapshot,
  ErpGatewayCustomerLedgerSnapshot,
  ErpGatewayCustomerPricingSnapshot,
  ErpGatewayCustomerRecentItemsSnapshot,
  ErpGatewayCustomerSpecialPricingSnapshot,
  ErpGatewayHealth,
  ErpGatewayObligoSnapshot,
  ErpGatewayOpenDeliveryNotesByCustomerSnapshot,
  ErpGatewayOpenDeliveryNotesListSnapshot,
  ErpGatewaySpecialPricesIndexSnapshot,
  ErpGatewayStockStatusSnapshot,
  ErpGatewayVendorsSnapshot,
  ErpOrderCancelRequest,
  ErpOrderCancelResponse,
  ErpOrderHandoffRequest,
  ErpOrderHandoffResponse,
} from './erp.gateway';

const TESTING_CATALOG_ITEMS = buildTestingCatalogItems();
const TESTING_CATALOG_ITEM_IDS = TESTING_CATALOG_ITEMS.map((item) => item.itemId);
const TESTING_CATALOG_NAME_BY_ITEM_ID = new Map(
  TESTING_CATALOG_ITEMS.map((item) => [item.itemId, item.name]),
);
const TESTING_CATALOG_UNIT_BY_ITEM_ID = new Map(
  TESTING_CATALOG_ITEMS.map((item) => [item.itemId, item.unit]),
);
const TESTING_PRICE_LINES = TESTING_CATALOG_ITEMS.map((item, index) => ({
  itemId: item.itemId,
  unitPrice: resolveTestingUnitPrice(item.itemId, index),
  currency: 'ILS',
}));

@Injectable()
export class TestingErpAdapter implements ErpGateway {
  async handoffOrder(request: ErpOrderHandoffRequest): Promise<ErpOrderHandoffResponse> {
    return {
      status: 'submitted',
      provider: 'hashavshevet',
      externalRef: `testing:${request.orderId}`,
      acceptedAt: new Date().toISOString(),
    };
  }

  async cancelOrder(request: ErpOrderCancelRequest): Promise<ErpOrderCancelResponse> {
    return {
      status: 'cancelled',
      provider: 'hashavshevet',
      externalRef: request.orderRef ?? request.orderId,
      canceledAt: new Date().toISOString(),
    };
  }

  async getHealth(): Promise<ErpGatewayHealth> {
    return {
      provider: 'hashavshevet',
      status: 'up',
      detail: 'Testing ERP adapter — no live Hashavshevet connection.',
    };
  }

  async getAssignedCustomers(_agentId: string): Promise<ErpGatewayAssignedCustomersSnapshot> {
    return {
      source: 'hashavshevet',
      syncedAt: new Date().toISOString(),
      customers: [{ customerId: 'cust-demo-001', isActive: true }],
    };
  }

  async getMasterCatalog(): Promise<ErpGatewayCatalogSnapshot> {
    return {
      source: 'hashavshevet',
      syncedAt: new Date().toISOString(),
      items: buildTestingCatalogItems(),
    };
  }

  async getCustomerRecentItems(_customerId: string): Promise<ErpGatewayCustomerRecentItemsSnapshot> {
    const now = new Date().toISOString();
    const [primaryItemId, secondaryItemId] = resolveTestingItemIds();

    return {
      source: 'hashavshevet',
      syncedAt: now,
      items: [
        {
          itemId: primaryItemId,
          name: resolveTestingItemName(primaryItemId),
          lastOrderedAt: now,
          unit: resolveTestingItemUnit(primaryItemId),
        },
        {
          itemId: secondaryItemId,
          name: resolveTestingItemName(secondaryItemId),
          lastOrderedAt: now,
          unit: resolveTestingItemUnit(secondaryItemId),
        },
      ],
    };
  }

  async getCustomerPricing(customerId: string): Promise<ErpGatewayCustomerPricingSnapshot> {
    return {
      source: 'hashavshevet',
      syncedAt: new Date().toISOString(),
      version: `price-list-${customerId}`,
      lines: TESTING_PRICE_LINES,
    };
  }

  async getVendors(): Promise<ErpGatewayVendorsSnapshot> {
    return { source: 'hashavshevet', syncedAt: new Date().toISOString(), vendors: [] };
  }

  async getSpecialPricesIndex(): Promise<ErpGatewaySpecialPricesIndexSnapshot> {
    return { source: 'hashavshevet', syncedAt: new Date().toISOString(), lines: [] };
  }

  async getAgents(): Promise<ErpGatewayAgentsSnapshot> {
    return { source: 'hashavshevet', syncedAt: new Date().toISOString(), agents: [] };
  }

  async getObligo(): Promise<ErpGatewayObligoSnapshot> {
    return { source: 'hashavshevet', syncedAt: new Date().toISOString(), entries: [] };
  }

  async getOpenDeliveryNotesList(): Promise<ErpGatewayOpenDeliveryNotesListSnapshot> {
    return { source: 'hashavshevet', syncedAt: new Date().toISOString(), notes: [] };
  }

  async getOpenDeliveryNotesByCustomer(customerId: string): Promise<ErpGatewayOpenDeliveryNotesByCustomerSnapshot> {
    return { source: 'hashavshevet', syncedAt: new Date().toISOString(), customerId, notes: [] };
  }

  async getCustomerSpecialPricing(customerId: string): Promise<ErpGatewayCustomerSpecialPricingSnapshot> {
    return { source: 'hashavshevet', syncedAt: new Date().toISOString(), customerId, lines: [] };
  }

  async getCustomerBalance(_customerId: string): Promise<ErpGatewayCustomerBalanceSnapshot> {
    return { source: 'hashavshevet', syncedAt: new Date().toISOString(), entries: [] };
  }

  async getCustomerLedger(customerId: string): Promise<ErpGatewayCustomerLedgerSnapshot> {
    return { source: 'hashavshevet', syncedAt: new Date().toISOString(), customerId, entries: [] };
  }

  async getStockStatus(): Promise<ErpGatewayStockStatusSnapshot> {
    return { source: 'hashavshevet', syncedAt: new Date().toISOString(), entries: [] };
  }
}

function resolveTestingItemIds(): [string, string] {
  const primary = TESTING_CATALOG_ITEM_IDS[0] ?? 'itm-beef-001';
  const secondary = TESTING_CATALOG_ITEM_IDS[1] ?? primary;
  return [primary, secondary];
}

function resolveTestingItemName(itemId: string): string {
  return TESTING_CATALOG_NAME_BY_ITEM_ID.get(itemId) ?? humanizeItemName(itemId);
}

function resolveTestingItemUnit(itemId: string): 'kg' {
  void TESTING_CATALOG_UNIT_BY_ITEM_ID.get(itemId);
  return 'kg';
}

function humanizeItemName(itemId: string): string {
  const words = itemId
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));

  return words.join(' ');
}

function resolveTestingUnitPrice(itemId: string, index: number): number {
  const hash = [...itemId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const shekels = 45 + (hash % 155);
  const cents = (index % 10) / 10;
  return Number((shekels + cents).toFixed(2));
}
