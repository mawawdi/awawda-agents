export type AgentRole = 'field_agent' | 'supervisor';

export interface AgentProfile {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: AgentRole;
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
  unit: 'kg';
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

export type SupervisorCustomerStatus = 'active' | 'inactive' | 'on_hold';

export interface SupervisorCustomerProfile {
  customerId: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  city: string | null;
  notes: string | null;
  status: SupervisorCustomerStatus;
  updatedAt: string;
}

export interface SupervisorCustomerProfileUpdateRequest {
  name?: string;
  contactName?: string | null;
  phone?: string | null;
  city?: string | null;
  notes?: string | null;
  status?: SupervisorCustomerStatus;
  reason?: string | null;
}

export type SupervisorCustomerProfileUpdateResponse = SupervisorCustomerProfile;

export interface SupervisorCustomerProfileListResponse {
  customers: SupervisorCustomerProfile[];
  total: number;
  generatedAt: string;
}

export interface SupervisorAgentOverview {
  agentId: string;
  name: string;
  phone: string;
  email: string | null;
  role: AgentRole;
  isActive: boolean;
  assignmentCount: number;
}

export interface SupervisorAgentsResponse {
  agents: SupervisorAgentOverview[];
  total: number;
  generatedAt: string;
}

export interface SupervisorAgentCreateRequest {
  name: string;
  phone: string;
  email?: string | null;
  password: string;
  role?: AgentRole;
}

export interface SupervisorAgentCreateResponse {
  agent: SupervisorAgentOverview;
  createdAt: string;
}

export interface SupervisorAgentAccessUpdateRequest {
  isActive: boolean;
  reason?: string | null;
}

export interface SupervisorAgentAccessUpdateResponse {
  agent: SupervisorAgentOverview;
  changed: boolean;
  reason: string | null;
  updatedAt: string;
}

export interface SupervisorAgentForceLogoutRequest {
  reason?: string | null;
}

export interface SupervisorAgentForceLogoutResponse {
  agentId: string;
  revoked: boolean;
  reason: string | null;
  revokedAt: string;
}

export interface SupervisorCustomerAssignmentMetadata {
  assignmentCount: number;
  assignedAgentIds: string[];
  lastAssignedAt: string | null;
}

export interface SupervisorCustomerOverview extends SupervisorCustomerProfile {
  assignment: SupervisorCustomerAssignmentMetadata;
}

export interface SupervisorCustomersResponse {
  customers: SupervisorCustomerOverview[];
  total: number;
  generatedAt: string;
}

export interface SupervisorAgentAssignment {
  customerId: string;
  agentId: string;
  assignedAt: string;
}

export interface SupervisorCustomerAssignmentsResponse {
  customerId: string;
  assignments: SupervisorAgentAssignment[];
  total: number;
  generatedAt: string;
}

export interface SupervisorCustomerAssignAgentRequest {
  agentId: string;
}

export interface SupervisorCustomerAssignAgentResponse {
  customerId: string;
  assignment: SupervisorAgentAssignment;
  created: boolean;
}

export interface SupervisorCustomerUnassignAgentResponse {
  customerId: string;
  agentId: string;
  removed: boolean;
  removedAt: string;
}

export interface SupervisorBulkReassignRequest {
  fromAgentId: string;
  toAgentId: string;
  customerIds?: string[];
  reason?: string | null;
}

export interface SupervisorBulkReassignResponse {
  fromAgentId: string;
  toAgentId: string;
  requestedCustomers: number;
  reassignedCustomers: number;
  skippedCustomers: number;
  createdAssignments: number;
  removedAssignments: number;
  processedCustomerIds: string[];
  generatedAt: string;
}

export type SupervisorAuditActorType = 'agent' | 'customer_session' | 'system';

export interface SupervisorAuditEntry {
  id: string;
  actorType: SupervisorAuditActorType;
  actorId: string;
  eventType: string;
  eventPayload: Record<string, unknown> | null;
  createdAt: string;
}

export interface SupervisorAuditLogResponse {
  entries: SupervisorAuditEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  generatedAt: string;
}

export interface SupervisorOversightOrdersByAgentEntry {
  agentId: string | null;
  agentName: string;
  orderCount: number;
  submittedCount: number;
  pendingRetryCount: number;
  failedCount: number;
  totalAmount: number;
}

export interface SupervisorOversightOrdersByCustomerEntry {
  customerId: string;
  customerName: string;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  orderCount: number;
  submittedCount: number;
  pendingRetryCount: number;
  failedCount: number;
  totalAmount: number;
}

export interface SupervisorOversightOrdersSummary {
  totalOrders: number;
  submittedCount: number;
  pendingRetryCount: number;
  failedCount: number;
  totalAmount: number;
  byAgent: SupervisorOversightOrdersByAgentEntry[];
  byCustomer: SupervisorOversightOrdersByCustomerEntry[];
}

export interface SupervisorOversightErpSignal {
  orderId: string;
  orderRef: string | null;
  customerId: string;
  customerName: string;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  status: 'pending_retry' | 'failed';
  submittedAt: string;
  estimatedTotal: number;
}

export interface SupervisorOversightErpBoard {
  pendingRetryCount: number;
  failedCount: number;
  totalNeedingAttention: number;
  recentSignals: SupervisorOversightErpSignal[];
}

export interface SupervisorOversightActivationFunnel {
  magicLinksIssued: number;
  activationAttempts: number;
  activationSuccesses: number;
  sessionsActivated: number;
  ordersSubmitted: number;
  activationSuccessRate: number;
  linkToSessionConversionRate: number;
  sessionToOrderConversionRate: number;
}

export interface SupervisorOversightUnassignedCustomers {
  total: number;
  customers: SupervisorCustomerOverview[];
}

export interface SupervisorOversightWindow {
  startAt: string;
  endAt: string;
  timezone: string;
}

export interface SupervisorOversightResponse {
  window: SupervisorOversightWindow;
  orders: SupervisorOversightOrdersSummary;
  unassignedCustomers: SupervisorOversightUnassignedCustomers;
  erp: SupervisorOversightErpBoard;
  funnel: SupervisorOversightActivationFunnel;
  generatedAt: string;
}

export interface AgentCatalogItem {
  itemId: string;
  sku: string;
  name: string;
  unit: 'kg';
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
  unit?: 'kg';
}

export interface CustomerRecentOrderLine {
  itemId: string;
  itemName: string;
  quantity: number;
  unit: 'kg';
}

export interface CustomerRecentOrderEntry {
  compositionSignature: string;
  lines: CustomerRecentOrderLine[];
  lastOrderedAt: string;
  orderCount: number;
}

export interface CustomerRecentOrdersFeed {
  entries: CustomerRecentOrderEntry[];
  total: number;
  pageSize: number;
  sortBy: 'lastOrderedAt_desc_compositionSignature_asc';
  generatedAt: string;
  windowStartAt: string;
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
  recentOrders: CustomerRecentOrdersFeed;
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
  unit: 'kg';
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
