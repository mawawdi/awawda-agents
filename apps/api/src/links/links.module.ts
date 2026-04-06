import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { AuthModule } from '../auth/auth.module';
import { loadLinksConfig } from './links.config';
import { LINKS_CONFIG, MAGIC_LINKS_REPOSITORY, MAGIC_LINK_TOKEN_GENERATOR } from './links.constants';
import { LinksController } from './links.controller';
import { PrismaMagicLinksRepository } from './links.repository';
import { LinksService } from './links.service';
import { CryptoMagicLinkTokenGenerator } from './token-generator';

@Module({
  imports: [AuthModule],
  controllers: [LinksController],
  providers: [
    PrismaClient,
    LinksService,
    PrismaMagicLinksRepository,
    CryptoMagicLinkTokenGenerator,
    {
      provide: LINKS_CONFIG,
      useFactory: loadLinksConfig,
    },
    {
      provide: MAGIC_LINKS_REPOSITORY,
      useExisting: PrismaMagicLinksRepository,
    },
    {
      provide: MAGIC_LINK_TOKEN_GENERATOR,
      useExisting: CryptoMagicLinkTokenGenerator,
    },
  ],
})
export class LinksModule {}
