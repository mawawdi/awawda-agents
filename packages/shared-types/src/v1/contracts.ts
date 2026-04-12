export interface AgentProfile {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

export interface AgentLoginRequest {
  phoneOrEmail: string;
  password: string;
}

export interface AgentLoginResponse {
  accessToken: string;
  expiresIn: number;
  agentProfile: AgentProfile;
}

export interface AgentAssignedCustomer {
  customerId: string;
  approvedItemsCount: number;
  lastOrderAt: string | null;
}

export interface AgentCustomersResponse {
  customers: AgentAssignedCustomer[];
  total: number;
  generatedAt: string;
}

export interface AgentMagicLinkIssueResponse {
  linkUrl: string;
  expiresAt: string;
  expiresInSeconds: number;
  lifecycle: 'issued';
}

export interface AgentApprovedItem {
  hashItemId: string;
  addedByAgentId: string;
  createdAt: string;
}

export interface AgentApprovedItemsResponse {
  customerId: string;
  items: AgentApprovedItem[];
  total: number;
  generatedAt: string;
}

export interface AgentApprovedItemMutationResponse {
  customerId: string;
  item: AgentApprovedItem;
  created: boolean;
}

export interface AgentOrderCardLine {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: 'kg' | 'unit';
  lineTotal: number;
}

export interface AgentOrderCard {
  orderId: string;
  orderRef: string | null;
  customerId: string;
  customerName: string;
  submittedAt: string;
  status: 'submitted' | 'pending_retry' | 'failed';
  estimatedTotal: number;
  currency: string;
  items: AgentOrderCardLine[];
  canCancel: boolean;
}

export interface AgentOrdersResponse {
  orders: AgentOrderCard[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  generatedAt: string;
}

export interface AgentOrderCancelResponse {
  orderId: string;
  removed: boolean;
  status: 'cancelled';
  canceledAt: string;
  mode: 'testing_local_delete' | 'hashavshevet';
}

export interface AgentCatalogItem {
  itemId: string;
  sku: string;
  name: string;
  unit: 'kg' | 'unit';
  isActive: boolean;
  category?: 'beef' | 'chicken' | 'lamb' | 'turkey' | 'veal' | 'offal' | 'prepared' | 'seafood';
  iconEmoji?: string;
  imageUrl?: string;
  isTestingOnly?: boolean;
}

export interface AgentCatalogCacheMetadata {
  status: 'hit' | 'miss';
  generatedAt: string;
  expiresAt: string;
  ttlSeconds: number;
}

export interface AgentCatalogResponse {
  items: AgentCatalogItem[];
  source: 'hashavshevet';
  cache: AgentCatalogCacheMetadata;
}

export interface CustomerSessionActivateRequest {
  token: string;
}

export interface CustomerPortalCustomer {
  customerId: string;
}

export interface CustomerRecentItem {
  itemId: string;
  name: string;
  lastOrderedAt: string;
}

export interface CustomerPricingLine {
  itemId: string;
  unitPrice: number;
  currency: string;
}

export interface CustomerApprovedItem {
  hashItemId: string;
  addedByAgentId: string;
  createdAt: string;
}

export interface CustomerPortalDataPayload {
  customer: CustomerPortalCustomer;
  recentItems: CustomerRecentItem[];
  approvedItems: CustomerApprovedItem[];
  pricing: CustomerPricingLine[];
  priceListVersion: string;
  sessionExpiresAt: string;
}

export interface CustomerSessionActivateResponse extends CustomerPortalDataPayload {
  sessionToken: string;
}

export type CustomerPortalDataResponse = CustomerPortalDataPayload;

export interface CustomerOrderSubmitLine {
  itemId: string;
  quantity: number;
  unit: 'kg' | 'unit';
  clientUnitPrice: number;
}

export interface CustomerOrderSubmitRequest {
  lines: CustomerOrderSubmitLine[];
  notes?: string;
}

export interface CustomerOrderSubmitResponse {
  orderId: string;
  orderRef: string;
  status: 'submitted' | 'pending_retry' | 'failed';
}

export interface CustomerOrderMismatchLine {
  lineIndex: number;
  itemId: string;
  reason: string;
  submittedUnitPrice?: number;
  currentUnitPrice?: number;
}

export interface CustomerOrderMismatchResponse {
  code: 'ORDER_LINES_MISMATCH';
  lines: CustomerOrderMismatchLine[];
}
