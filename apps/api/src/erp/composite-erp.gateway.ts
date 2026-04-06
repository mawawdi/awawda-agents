import { Inject, Injectable } from '@nestjs/common';

import { ERP_ERROR_CODES, isErpGatewayError, type ErpErrorCode } from './erp.errors';
import type {
  ErpGateway,
  ErpGatewayCatalogSnapshot,
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
  ERP_ERROR_CODES.ERP_ORDER_HANDOFF_FAILED,
]);

@Injectable()
export class CompositeErpGateway implements ErpGateway {
  constructor(
    @Inject(HashavshevetAdapter) private readonly hashavshevetAdapter: HashavshevetAdapter,
    @Inject(BMaxXmlAdapter) private readonly bmaxXmlAdapter: BMaxXmlAdapter,
  ) {}

  async handoffOrder(request: ErpOrderHandoffRequest): Promise<ErpOrderHandoffResponse> {
    try {
      return await this.hashavshevetAdapter.handoffOrder(request);
    } catch (error) {
      if (isErpGatewayError(error) && FALLBACK_ERROR_CODES.has(error.code)) {
        return this.bmaxXmlAdapter.handoffOrder(request);
      }

      throw error;
    }
  }

  async getHealth(): Promise<ErpGatewayHealth> {
    return this.hashavshevetAdapter.getHealth();
  }

  async getMasterCatalog(): Promise<ErpGatewayCatalogSnapshot> {
    return this.hashavshevetAdapter.getMasterCatalog();
  }
}
