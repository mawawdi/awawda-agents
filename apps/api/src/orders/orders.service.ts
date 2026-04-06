import { Inject, Injectable } from '@nestjs/common';

import {
  ERP_GATEWAY,
  type ErpGateway,
  type ErpOrderHandoffRequest,
  type ErpOrderHandoffResponse,
} from '../erp/erp.gateway';

@Injectable()
export class OrdersService {
  constructor(@Inject(ERP_GATEWAY) private readonly erpGateway: ErpGateway) {}

  async handoffToErp(request: ErpOrderHandoffRequest): Promise<ErpOrderHandoffResponse> {
    return this.erpGateway.handoffOrder(request);
  }
}
