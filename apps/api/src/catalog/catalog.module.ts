import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ErpModule } from '../erp/erp.module';
import { loadCatalogConfig } from './catalog.config';
import { CATALOG_CONFIG } from './catalog.constants';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { TestingAssetsController } from './testing-assets.controller';

@Module({
  imports: [AuthModule, ErpModule],
  controllers: [CatalogController, TestingAssetsController],
  providers: [
    CatalogService,
    {
      provide: CATALOG_CONFIG,
      useFactory: loadCatalogConfig,
    },
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
