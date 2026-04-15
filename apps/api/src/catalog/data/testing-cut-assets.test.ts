import { describe, expect, it } from 'vitest';

import { buildTestingCatalogItems } from './testing-cuts-catalog';
import {
  getTestingCutAssetsVersion,
  listTestingCutAssetItemIds,
  resolveTestingCutAssetByItemId,
  resolveTestingCutAssetByName,
  resolveTestingCutAssetByPath,
} from './testing-cut-assets';

describe('testing cut assets', () => {
  it('resolves seeded approved-item ids to local testing images', () => {
    expect(resolveTestingCutAssetByItemId('itm-beef-ribeye')).toMatchObject({
      species: 'beef',
      relativePath: 'beef/beef_ribeye_steak_boneless.jpg',
      contentType: 'image/png',
    });
    expect(resolveTestingCutAssetByItemId('itm-chicken-thigh')).toMatchObject({
      species: 'chicken',
      relativePath: 'chicken/chicken_thigh_bone_in_skin_on.jpg',
    });
  });

  it('resolves cut slugs like beef_ribeye_steak to image files', () => {
    expect(resolveTestingCutAssetByItemId('beef_ribeye_steak')).toMatchObject({
      species: 'beef',
      relativePath: 'beef/beef_ribeye_steak_boneless.jpg',
    });
  });

  it('resolves localized catalog names to local image assets', () => {
    expect(resolveTestingCutAssetByName('lamb', 'Boneless leg of lamb (rolled and tied)')).toMatchObject({
      species: 'lamb',
      relativePath: 'lamb/lamb_boneless_leg.jpg',
    });
    expect(resolveTestingCutAssetByName('chicken', 'Whole broiler / fryer')).toMatchObject({
      species: 'chicken',
      relativePath: 'chicken/chicken_whole_broiler_fryer.jpg',
    });
  });

  it('resolves direct path lookups and provides version hash', () => {
    const direct = resolveTestingCutAssetByPath('beef', 'beef_ribeye_steak_boneless.jpg');
    expect(direct).toMatchObject({
      species: 'beef',
      relativePath: 'beef/beef_ribeye_steak_boneless.jpg',
      contentType: 'image/png',
    });
    expect(getTestingCutAssetsVersion()).toMatch(/^[a-f0-9]{12}$/);
  });

  it('exposes the testing list directly from image filenames', () => {
    const ids = listTestingCutAssetItemIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toEqual(expect.arrayContaining(['beef_ribeye_steak_boneless', 'chicken_whole_roaster', 'lamb_ground']));
  });

  it('resolves every localized catalog item id to an image asset', () => {
    const catalogItems = buildTestingCatalogItems();
    const unresolved = catalogItems.filter((item) => resolveTestingCutAssetByItemId(item.itemId) === null);
    expect(unresolved).toEqual([]);
  });

  it('maps numeric-sequence item ids to their catalog-specific image assets', () => {
    const catalogItems = buildTestingCatalogItems();
    const catalogImagePathByItemId = new Map(
      catalogItems
        .filter((item) => typeof item.imageUrl === 'string' && item.imageUrl.length > 0)
        .map((item) => [item.itemId, item.imageUrl!.replace('/v1/testing-assets/cuts/', '').replace(/\?.*$/, '')]),
    );

    for (const itemId of ['itm-beef-015', 'itm-chicken-011', 'itm-lamb-010']) {
      const resolved = resolveTestingCutAssetByItemId(itemId);
      expect(resolved).not.toBeNull();
      expect(resolved?.relativePath).toBe(catalogImagePathByItemId.get(itemId));
    }
  });
});
