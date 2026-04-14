import { describe, expect, it } from 'vitest';

import { REQUIRED_CUT_NAMES_EN_BY_SPECIES } from './required-cuts';
import { buildTestingCatalogItems, getTestingLocalizedCutsCatalog } from './testing-cuts-catalog';

const EXPECTED_PRIMALS: Record<'beef' | 'chicken' | 'lamb', string[]> = {
  beef: [
    'chuck-shoulder-neck',
    'rib',
    'loin-short-loin-sirloin',
    'round-hind-leg',
    'plate-flank-belly',
    'brisket-chest',
    'shank-legs',
    'other-offal-specialty',
  ],
  chicken: ['whole-bird-preparations', 'breast', 'legs', 'wings', 'other-offal'],
  lamb: ['leg', 'loin', 'rack-rib', 'shoulder', 'breast-flank', 'shank', 'other-offal'],
};

const EXTRA_PROMPT_CUTS: Record<'beef' | 'chicken' | 'lamb', string[]> = {
  beef: [],
  chicken: [
    'Whole broiler',
    'Whole fryer',
    'Flat',
    'Wingette',
    'Wing tip',
    'Flapper',
    'Chicken paws',
    'Chicken feet',
    'Chicken backs',
    'Chicken frames',
    'Ground chicken (Breast-only)',
    'Ground chicken (Mixed dark/white meat)',
  ],
  lamb: [],
};

describe('testing cuts catalog dataset', () => {
  it('keeps full section coverage and Hebrew localization for all required+extra prompt cuts', () => {
    const dataset = getTestingLocalizedCutsCatalog();
    expect(dataset.species.map((species) => species.id)).toEqual(['beef', 'chicken', 'lamb']);

    for (const species of dataset.species) {
      expect(species.primals.map((primal) => primal.id)).toEqual(EXPECTED_PRIMALS[species.id]);

      const cuts = species.primals.flatMap((primal) => primal.groups.flatMap((group) => group.cuts));
      const cutNames = new Set(cuts.map((cut) => cut.nameEn));

      for (const cut of cuts) {
        expect(cut.nameEn.length).toBeGreaterThan(0);
        expect(cut.nameHe.length).toBeGreaterThan(0);
      }

      const expectedNames = [...REQUIRED_CUT_NAMES_EN_BY_SPECIES[species.id], ...EXTRA_PROMPT_CUTS[species.id]];
      const missing = expectedNames.filter((name) => !cutNames.has(name));

      expect(missing).toEqual([]);
      expect(cutNames.size).toBe(expectedNames.length);
    }
  });

  it('builds testing catalog items from the localized dataset', () => {
    const items = buildTestingCatalogItems();

    expect(items).toHaveLength(134);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ itemId: 'itm-beef-001', name: 'Chuck eye roast', isTestingOnly: true }),
        expect.objectContaining({
          itemId: 'itm-beef-001',
          iconEmoji: '🐄',
          imageUrl: expect.stringMatching(/^\/v1\/testing-assets\/cuts\/beef\/.+\?v=[a-f0-9]{12}$/),
        }),
        expect.objectContaining({ itemId: 'itm-beef-067', name: 'Stew meat (beef trimmings)', isTestingOnly: true }),
        expect.objectContaining({ itemId: 'itm-chicken-001', name: 'Whole roaster', isTestingOnly: true }),
        expect.objectContaining({ itemId: 'itm-chicken-037', name: 'Ground chicken (Mixed dark/white meat)', isTestingOnly: true }),
        expect.objectContaining({ itemId: 'itm-lamb-001', name: 'Whole leg of lamb (bone-in)', isTestingOnly: true }),
        expect.objectContaining({ itemId: 'itm-lamb-030', name: 'Lamb sweetbreads', isTestingOnly: true }),
      ]),
    );
    expect(new Set(items.map((item) => item.itemId)).size).toBe(items.length);
  });
});
