import { describe, expect, it } from 'vitest';

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
});
