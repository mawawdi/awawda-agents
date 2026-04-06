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

export interface AgentCatalogItem {
  itemId: string;
  sku: string;
  name: string;
  unit: 'kg' | 'unit';
  isActive: boolean;
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
