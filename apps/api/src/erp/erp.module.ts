import { Module } from '@nestjs/common';

import { BMaxXmlAdapter } from './bmax-xml.adapter';
import { CompositeErpGateway } from './composite-erp.gateway';
import { ERP_GATEWAY } from './erp.gateway';
import { HashavshevetAdapter } from './hashavshevet.adapter';

@Module({
  providers: [
    HashavshevetAdapter,
    BMaxXmlAdapter,
    CompositeErpGateway,
    {
      provide: ERP_GATEWAY,
      useExisting: CompositeErpGateway,
    },
  ],
  exports: [ERP_GATEWAY],
})
export class ErpModule {}
