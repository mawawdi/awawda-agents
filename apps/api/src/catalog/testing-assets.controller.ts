import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { createReadStream } from 'node:fs';

import { isProductionHashRuntime } from '../runtime/production-guardrails';
import {
  getTestingCutAssetsVersion,
  type ResolvedTestingCutAsset,
  resolveTestingCutAssetByItemId,
  resolveTestingCutAssetByPath,
} from './data/testing-cut-assets';

const TESTING_ASSET_CACHE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

@Controller({ path: 'testing-assets', version: '1' })
export class TestingAssetsController {
  @Get('items/:itemId/image')
  async getItemImage(
    @Param('itemId') itemId: string,
    @Res() reply: { header(name: string, value: string): void; send(payload: unknown): void },
  ): Promise<void> {
    this.assertTestingAssetsEnabled();

    const asset = resolveTestingCutAssetByItemId(itemId);
    if (!asset) {
      throw new NotFoundException('Testing image was not found for this item.');
    }

    this.sendImageResponse(reply, asset);
  }

  @Get('cuts/:species/:fileName')
  async getCutImage(
    @Param('species') species: string,
    @Param('fileName') fileName: string,
    @Res() reply: { header(name: string, value: string): void; send(payload: unknown): void },
  ): Promise<void> {
    this.assertTestingAssetsEnabled();

    const asset = resolveTestingCutAssetByPath(species, fileName);
    if (!asset) {
      throw new NotFoundException('Testing image was not found.');
    }

    this.sendImageResponse(reply, asset);
  }

  private sendImageResponse(
    reply: { header(name: string, value: string): void; send(payload: unknown): void },
    asset: ResolvedTestingCutAsset,
  ): void {
    reply.header('Content-Type', asset.contentType);
    reply.header('Cache-Control', `public, max-age=${TESTING_ASSET_CACHE_MAX_AGE_SECONDS}, immutable`);
    reply.header('ETag', asset.etag);
    reply.header('Vary', 'Accept-Encoding');
    reply.header('X-Testing-Assets-Version', getTestingCutAssetsVersion());
    reply.send(createReadStream(asset.absolutePath));
  }

  private assertTestingAssetsEnabled(): void {
    if (!isProductionHashRuntime()) {
      return;
    }

    throw new NotFoundException('Testing assets route is disabled in HASH_ENV=production.');
  }
}
