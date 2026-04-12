import { Inject, Injectable } from '@nestjs/common';

import { ERP_ERROR_CODES, isErpGatewayError, type ErpErrorCode } from './erp.errors';
import type {
  ErpOrderCancelRequest,
  ErpOrderCancelResponse,
  ErpGateway,
  ErpGatewayAssignedCustomersSnapshot,
  ErpGatewayCatalogSnapshot,
  ErpGatewayCustomerPricingSnapshot,
  ErpGatewayCustomerRecentItemsSnapshot,
  ErpGatewayHealth,
  ErpOrderHandoffRequest,
  ErpOrderHandoffResponse,
} from './erp.gateway';
import { BMaxXmlAdapter } from './bmax-xml.adapter';
import { HashavshevetAdapter } from './hashavshevet.adapter';

const FALLBACK_ERROR_CODES: ReadonlySet<ErpErrorCode> = new Set([
  ERP_ERROR_CODES.ERP_UNAVAILABLE,
  ERP_ERROR_CODES.ERP_TIMEOUT,
  ERP_ERROR_CODES.ERP_NOT_IMPLEMENTED,
]);
const NON_FALLBACK_ERROR_CODES: ReadonlySet<ErpErrorCode> = new Set([
  ERP_ERROR_CODES.ERP_AUTH_FAILED,
  ERP_ERROR_CODES.ERP_VALIDATION_FAILED,
]);

@Injectable()
export class CompositeErpGateway implements ErpGateway {
  constructor(
    @Inject(HashavshevetAdapter) private readonly hashavshevetAdapter: HashavshevetAdapter,
    @Inject(BMaxXmlAdapter) private readonly bmaxXmlAdapter: BMaxXmlAdapter,
  ) {}

  async handoffOrder(request: ErpOrderHandoffRequest): Promise<ErpOrderHandoffResponse> {
    try {
      const response = await this.hashavshevetAdapter.handoffOrder(request);
      return this.toStableHandoffResponse(response);
    } catch (error) {
      if (shouldFallbackToBmax(error)) {
        const fallbackResponse = await this.bmaxXmlAdapter.handoffOrder(request);
        return this.toStableHandoffResponse(fallbackResponse);
      }

      throw error;
    }
  }

  async cancelOrder(request: ErpOrderCancelRequest): Promise<ErpOrderCancelResponse> {
    const response = await this.hashavshevetAdapter.cancelOrder(request);
    return this.toStableCancelResponse(response);
  }

  async getHealth(): Promise<ErpGatewayHealth> {
    return this.hashavshevetAdapter.getHealth();
  }

  async getAssignedCustomers(agentId: string): Promise<ErpGatewayAssignedCustomersSnapshot> {
    return this.hashavshevetAdapter.getAssignedCustomers(agentId);
  }

  async getMasterCatalog(): Promise<ErpGatewayCatalogSnapshot> {
    return this.hashavshevetAdapter.getMasterCatalog();
  }

  async getCustomerRecentItems(customerId: string): Promise<ErpGatewayCustomerRecentItemsSnapshot> {
    return this.hashavshevetAdapter.getCustomerRecentItems(customerId);
  }

  async getCustomerPricing(customerId: string): Promise<ErpGatewayCustomerPricingSnapshot> {
    return this.hashavshevetAdapter.getCustomerPricing(customerId);
  }

  private toStableHandoffResponse(response: ErpOrderHandoffResponse): ErpOrderHandoffResponse {
    return {
      status: response.status,
      provider: response.provider,
      externalRef: response.externalRef,
      acceptedAt: response.acceptedAt,
    };
  }

  private toStableCancelResponse(response: ErpOrderCancelResponse): ErpOrderCancelResponse {
    return {
      status: response.status,
      provider: response.provider,
      externalRef: response.externalRef,
      canceledAt: response.canceledAt,
    };
  }
}

function shouldFallbackToBmax(error: unknown): boolean {
  const errorCodes = collectErrorCodeChain(error);

  if (errorCodes.length === 0) {
    return false;
  }

  if (errorCodes.some((code) => NON_FALLBACK_ERROR_CODES.has(code))) {
    return false;
  }

  return errorCodes.some((code) => FALLBACK_ERROR_CODES.has(code));
}

function collectErrorCodeChain(error: unknown): ErpErrorCode[] {
  const codes: ErpErrorCode[] = [];
  const seen = new Set<unknown>();
  let currentError: unknown = error;

  while (isErpGatewayError(currentError) && !seen.has(currentError)) {
    codes.push(currentError.code);
    seen.add(currentError);
    currentError = currentError.cause;
  }

  return codes;
}
