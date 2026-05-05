import type { AgentCatalogItem, CustomerPricingLine, CustomerRecentItem } from '@awawda/shared-types';

export const ERP_GATEWAY = Symbol('ERP_GATEWAY');

export type ErpGatewayAssignedCustomer = {
  customerId: string;
  isActive: boolean;
};

export type ErpOrderLine = {
  itemId: string;
  quantity: number;
  unit: 'kg';
  clientUnitPrice: number;
};

export type ErpOrderHandoffRequest = {
  orderId: string;
  customerId: string;
  lines: ErpOrderLine[];
  notes?: string;
  hashAgentId?: string;
};

export type ErpOrderHandoffStatus = 'submitted' | 'pending_retry' | 'failed';

export type ErpOrderHandoffResponse = {
  status: ErpOrderHandoffStatus;
  provider: 'hashavshevet' | 'bmax_xml';
  externalRef: string;
  acceptedAt: string;
};

export type ErpOrderCancelRequest = {
  orderId: string;
  orderRef: string | null;
  customerId: string;
  reason?: string;
};

export type ErpOrderCancelResponse = {
  status: 'cancelled' | 'pending_retry';
  provider: 'hashavshevet' | 'bmax_xml';
  externalRef: string;
  canceledAt: string;
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

export type ErpGatewayAssignedCustomersSnapshot = {
  customers: ErpGatewayAssignedCustomer[];
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

export type ErpGatewayVendor = {
  vendorId: string;
  name: string;
  isActive: boolean;
};

export type ErpGatewayVendorsSnapshot = {
  vendors: ErpGatewayVendor[];
  syncedAt: string;
  source: 'hashavshevet';
};

export type ErpGatewaySpecialPriceLine = {
  itemId: string;
  itemName: string;
  unitPrice: number;
  currency: string;
};

export type ErpGatewaySpecialPricesIndexSnapshot = {
  lines: ErpGatewaySpecialPriceLine[];
  syncedAt: string;
  source: 'hashavshevet';
};

export type ErpGatewayAgent = {
  agentId: string;
  name: string;
  isActive: boolean;
};

export type ErpGatewayAgentsSnapshot = {
  agents: ErpGatewayAgent[];
  syncedAt: string;
  source: 'hashavshevet';
};

export type ErpGatewayObligoEntry = {
  customerId: string;
  balance: number;
  creditLimit: number;
  currency: string;
};

export type ErpGatewayObligoSnapshot = {
  entries: ErpGatewayObligoEntry[];
  syncedAt: string;
  source: 'hashavshevet';
};

export type ErpGatewayDeliveryNote = {
  documentId: string;
  customerId: string;
  date: string;
  totalAmount: number;
  currency: string;
};

export type ErpGatewayOpenDeliveryNotesListSnapshot = {
  notes: ErpGatewayDeliveryNote[];
  syncedAt: string;
  source: 'hashavshevet';
};

export type ErpGatewayOpenDeliveryNotesByCustomerSnapshot = {
  customerId: string;
  notes: ErpGatewayDeliveryNote[];
  syncedAt: string;
  source: 'hashavshevet';
};

export type ErpGatewayCustomerSpecialPricingSnapshot = {
  customerId: string;
  lines: ErpGatewaySpecialPriceLine[];
  syncedAt: string;
  source: 'hashavshevet';
};

export type ErpGatewayBalanceEntry = {
  customerId: string;
  balance: number;
  currency: string;
};

export type ErpGatewayCustomerBalanceSnapshot = {
  entries: ErpGatewayBalanceEntry[];
  syncedAt: string;
  source: 'hashavshevet';
};

export type ErpGatewayLedgerEntry = {
  customerId: string;
  documentId: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  currency: string;
};

export type ErpGatewayCustomerLedgerSnapshot = {
  customerId: string;
  entries: ErpGatewayLedgerEntry[];
  syncedAt: string;
  source: 'hashavshevet';
};

export type ErpGatewayStockEntry = {
  itemId: string;
  itemName: string;
  warehouse: string;
  quantity: number;
  unit: string;
};

export type ErpGatewayStockStatusSnapshot = {
  entries: ErpGatewayStockEntry[];
  syncedAt: string;
  source: 'hashavshevet';
};

export interface ErpGateway {
  handoffOrder(request: ErpOrderHandoffRequest): Promise<ErpOrderHandoffResponse>;
  cancelOrder?(request: ErpOrderCancelRequest): Promise<ErpOrderCancelResponse>;
  getHealth(): Promise<ErpGatewayHealth>;
  getAssignedCustomers(agentId: string): Promise<ErpGatewayAssignedCustomersSnapshot>;
  getMasterCatalog(): Promise<ErpGatewayCatalogSnapshot>;
  getCustomerRecentItems(customerId: string): Promise<ErpGatewayCustomerRecentItemsSnapshot>;
  getCustomerPricing(customerId: string): Promise<ErpGatewayCustomerPricingSnapshot>;

  getVendors?(): Promise<ErpGatewayVendorsSnapshot>;
  getSpecialPricesIndex?(): Promise<ErpGatewaySpecialPricesIndexSnapshot>;
  getAgents?(): Promise<ErpGatewayAgentsSnapshot>;
  getObligo?(): Promise<ErpGatewayObligoSnapshot>;
  getOpenDeliveryNotesList?(): Promise<ErpGatewayOpenDeliveryNotesListSnapshot>;
  getOpenDeliveryNotesByCustomer?(customerId: string): Promise<ErpGatewayOpenDeliveryNotesByCustomerSnapshot>;
  getCustomerSpecialPricing?(customerId: string): Promise<ErpGatewayCustomerSpecialPricingSnapshot>;
  getCustomerBalance?(customerId: string): Promise<ErpGatewayCustomerBalanceSnapshot>;
  getCustomerLedger?(customerId: string): Promise<ErpGatewayCustomerLedgerSnapshot>;
  getStockStatus?(): Promise<ErpGatewayStockStatusSnapshot>;
}
