import { describe, expect, it } from 'vitest';

import { buildTestingCatalogItems, getTestingLocalizedCutsCatalog } from './testing-cuts-catalog';

describe('testing cuts catalog dataset', () => {
  it('keeps a species -> primal/group -> cuts structure with Hebrew localization per cut', () => {
    const dataset = getTestingLocalizedCutsCatalog();

    expect(dataset.species.map((species) => species.id)).toEqual(['beef', 'lamb', 'chicken']);

    for (const species of dataset.species) {
      for (const primal of species.primals) {
        for (const group of primal.groups) {
          for (const cut of group.cuts) {
            expect(cut.nameEn.length).toBeGreaterThan(0);
            expect(cut.nameHe.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('builds testing catalog items from the localized dataset', () => {
    const items = buildTestingCatalogItems();

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: 'itm-beef-entrecote', name: 'Beef Entrecôte', isTestingOnly: true }),
        expect.objectContaining({ itemId: 'itm-lamb-ribs', name: 'Lamb Ribs', isTestingOnly: true }),
        expect.objectContaining({ itemId: 'itm-chicken-breast', name: 'Chicken Breast Skinless', isTestingOnly: true }),
      ]),
    );
    expect(new Set(items.map((item) => item.itemId)).size).toBe(items.length);
  });
});
