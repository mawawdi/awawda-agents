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

export interface ErpGateway {
  handoffOrder(request: ErpOrderHandoffRequest): Promise<ErpOrderHandoffResponse>;
  getHealth(): Promise<ErpGatewayHealth>;
}
