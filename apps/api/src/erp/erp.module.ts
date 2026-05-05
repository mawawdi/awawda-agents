import { Module } from '@nestjs/common';

import { resolveHashEnvironment } from '../runtime/production-guardrails';
import { BMaxXmlAdapter } from './bmax-xml.adapter';
import { CompositeErpGateway } from './composite-erp.gateway';
import { ERP_GATEWAY } from './erp.gateway';
import { HashavshevetAdapter } from './hashavshevet.adapter';
import { TestingErpAdapter } from './testing-erp.adapter';

@Module({
  providers: [
    HashavshevetAdapter,
    BMaxXmlAdapter,
    CompositeErpGateway,
    TestingErpAdapter,
    {
      provide: ERP_GATEWAY,
      useFactory: (
        compositeGateway: CompositeErpGateway,
        testingAdapter: TestingErpAdapter,
      ) => {
        const environment = resolveHashEnvironment(process.env.HASH_ENV);
        return environment === 'testing' ? testingAdapter : compositeGateway;
      },
      inject: [CompositeErpGateway, TestingErpAdapter],
    },
  ],
  exports: [ERP_GATEWAY],
})
export class ErpModule {}
