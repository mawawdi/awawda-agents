import type { AgentCatalogItem, CustomerPricingLine, CustomerRecentItem } from '@meatland/shared-types';

export const ERP_GATEWAY = Symbol('ERP_GATEWAY');

export type ErpOrderLine = {
  itemId: string;
  quantity: number;
  unit: 'kg' | 'unit';
  clientUnitPrice: number;
};

export type ErpOrderHandoffRequest = {
  orderId: string;
  customerId: string;
  lines: ErpOrderLine[];
  notes?: string;
};

export type ErpOrderHandoffStatus = 'submitted' | 'pending_retry' | 'failed';

export type ErpOrderHandoffResponse = {
  status: ErpOrderHandoffStatus;
  provider: 'hashavshevet' | 'bmax_xml';
  externalRef: string;
  acceptedAt: string;
};

export type ErpGatewayHealth = {
  provider: 'hashavshevet';
  status: 'up' | 'degraded' | 'down';
  detail: string;
};

export type ErpGatewayCatalogSnapshot = {
  items: AgentCatalogItem[];
  syncedAt: string;
  source: 'hashavshevet';
};

export type ErpGatewayCustomerRecentItemsSnapshot = {
  items: CustomerRecentItem[];
  syncedAt: string;
  source: 'hashavshevet';
};

export type ErpGatewayCustomerPricingSnapshot = {
  lines: CustomerPricingLine[];
  version: string;
  syncedAt: string;
  source: 'hashavshevet';
};

export interface ErpGateway {
  handoffOrder(request: ErpOrderHandoffRequest): Promise<ErpOrderHandoffResponse>;
  getHealth(): Promise<ErpGatewayHealth>;
  getMasterCatalog(): Promise<ErpGatewayCatalogSnapshot>;
  getCustomerRecentItems(customerId: string): Promise<ErpGatewayCustomerRecentItemsSnapshot>;
  getCustomerPricing(customerId: string): Promise<ErpGatewayCustomerPricingSnapshot>;
}
