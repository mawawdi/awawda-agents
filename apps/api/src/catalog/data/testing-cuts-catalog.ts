import type { AgentCatalogItem } from '@awawda/shared-types';

import rawLocalizedCuts from './cuts.he.json';
import { REQUIRED_CUT_NAMES_EN_BY_SPECIES, type SupportedCutSpecies } from './required-cuts';
import {
  getTestingCutAssetsVersion,
  resolveTestingCutAssetByName,
  type TestingCutSpecies,
} from './testing-cut-assets';

type LocalizedCatalogCut = {
  itemId: string;
  sku: string;
  nameEn: string;
  nameHe: string;
  unit: AgentCatalogItem['unit'];
  category: NonNullable<AgentCatalogItem['category']>;
};

type LocalizedCatalogGroup = {
  id: string;
  nameEn: string;
  nameHe: string;
  cuts: LocalizedCatalogCut[];
};

type LocalizedCatalogPrimal = {
  id: string;
  nameEn: string;
  nameHe: string;
  groups: LocalizedCatalogGroup[];
};

type LocalizedCatalogSpecies = {
  id: 'beef' | 'chicken' | 'lamb';
  nameEn: string;
  nameHe: string;
  primals: LocalizedCatalogPrimal[];
};

export type LocalizedTestingCutsCatalog = {
  version: string;
  species: LocalizedCatalogSpecies[];
};

const TESTING_LOCALIZED_CUTS_CATALOG = validateLocalizedTestingCutsCatalog(rawLocalizedCuts);

export function getTestingLocalizedCutsCatalog(): LocalizedTestingCutsCatalog {
  return TESTING_LOCALIZED_CUTS_CATALOG;
}

export function buildTestingCatalogItems(): AgentCatalogItem[] {
  const imageVersion = getTestingCutAssetsVersion();

  return TESTING_LOCALIZED_CUTS_CATALOG.species.flatMap((species) =>
    species.primals.flatMap((primal) =>
      primal.groups.flatMap((group) =>
        group.cuts.map((cut) => {
          const visual = resolveTestingCutAssetByName(species.id, cut.nameEn);
          return {
            itemId: cut.itemId,
            sku: cut.sku,
            name: cut.nameHe,
            unit: cut.unit,
            isActive: true,
            category: cut.category,
            iconEmoji: visual ? SPECIES_ICON_BY_ID[species.id] : undefined,
            imageUrl: visual ? `/v1/testing-assets/cuts/${visual.relativePath}?v=${imageVersion}` : undefined,
            isTestingOnly: true,
          } satisfies AgentCatalogItem;
        }),
      ),
    ),
  );
}

const SPECIES_ICON_BY_ID: Record<TestingCutSpecies, string> = {
  beef: '🐄',
  chicken: '🐔',
  lamb: '🐑',
};

function validateLocalizedTestingCutsCatalog(rawCatalog: unknown): LocalizedTestingCutsCatalog {
  if (!isObject(rawCatalog)) {
    throw new Error('Localized cuts catalog must be an object');
  }

  const version = readRequiredString(rawCatalog, 'version');

  if (!Array.isArray(rawCatalog.species) || rawCatalog.species.length === 0) {
    throw new Error('Localized cuts catalog must include at least one species');
  }

  const seenItemIds = new Set<string>();

  const species = rawCatalog.species.map((speciesEntry) => {
    const rawSpeciesId = readRequiredString(speciesEntry, 'id');
    if (rawSpeciesId !== 'beef' && rawSpeciesId !== 'chicken' && rawSpeciesId !== 'lamb') {
      throw new Error(`Unsupported species "${rawSpeciesId}" in localized cuts catalog`);
    }
    const speciesId: LocalizedCatalogSpecies['id'] = rawSpeciesId;

    const primalsRaw = readRequiredArray(speciesEntry, 'primals');
    const primals = primalsRaw.map((primalEntry) => {
      const groupsRaw = readRequiredArray(primalEntry, 'groups');
      const groups = groupsRaw.map((groupEntry) => {
        const cutsRaw = readRequiredArray(groupEntry, 'cuts');
        const cuts = cutsRaw.map((cutEntry) => {
          const itemId = readRequiredString(cutEntry, 'itemId');
          if (seenItemIds.has(itemId)) {
            throw new Error(`Duplicate catalog itemId "${itemId}" in localized cuts catalog`);
          }

          seenItemIds.add(itemId);

          const unit = readRequiredString(cutEntry, 'unit');
          if (unit !== 'kg') {
            throw new Error(`Unsupported unit "${unit}" for item "${itemId}"`);
          }
          const normalizedUnit: AgentCatalogItem['unit'] = 'kg';

          const category = readRequiredString(cutEntry, 'category');
          if (!isCatalogCategory(category)) {
            throw new Error(`Unsupported category "${category}" for item "${itemId}"`);
          }

          return {
            itemId,
            sku: readRequiredString(cutEntry, 'sku'),
            nameEn: readRequiredString(cutEntry, 'nameEn'),
            nameHe: readRequiredString(cutEntry, 'nameHe'),
            unit: normalizedUnit,
            category,
          };
        });

        return {
          id: readRequiredString(groupEntry, 'id'),
          nameEn: readRequiredString(groupEntry, 'nameEn'),
          nameHe: readRequiredString(groupEntry, 'nameHe'),
          cuts,
        };
      });

      return {
        id: readRequiredString(primalEntry, 'id'),
        nameEn: readRequiredString(primalEntry, 'nameEn'),
        nameHe: readRequiredString(primalEntry, 'nameHe'),
        groups,
      };
    });

    return {
      id: speciesId,
      nameEn: readRequiredString(speciesEntry, 'nameEn'),
      nameHe: readRequiredString(speciesEntry, 'nameHe'),
      primals,
    };
  });

  return {
    version,
    species: validateRequiredCoverage(species),
  };
}

function validateRequiredCoverage(species: LocalizedCatalogSpecies[]): LocalizedCatalogSpecies[] {
  const namesBySpecies = new Map<SupportedCutSpecies, Set<string>>();
  for (const key of Object.keys(REQUIRED_CUT_NAMES_EN_BY_SPECIES) as SupportedCutSpecies[]) {
    namesBySpecies.set(key, new Set<string>());
  }

  for (const speciesEntry of species) {
    const bucket = namesBySpecies.get(speciesEntry.id);
    if (!bucket) {
      continue;
    }

    for (const primal of speciesEntry.primals) {
      for (const group of primal.groups) {
        for (const cut of group.cuts) {
          bucket.add(cut.nameEn);
        }
      }
    }
  }

  for (const requiredSpecies of Object.keys(REQUIRED_CUT_NAMES_EN_BY_SPECIES) as SupportedCutSpecies[]) {
    const actualNames = namesBySpecies.get(requiredSpecies) ?? new Set<string>();
    const missing = REQUIRED_CUT_NAMES_EN_BY_SPECIES[requiredSpecies].filter((name) => !actualNames.has(name));

    if (missing.length > 0) {
      throw new Error(
        `Localized cuts catalog is missing required ${requiredSpecies} cuts: ${missing.join(', ')}`,
      );
    }
  }

  return species;
}

function isCatalogCategory(rawValue: string): rawValue is NonNullable<AgentCatalogItem['category']> {
  return ['beef', 'chicken', 'lamb', 'turkey', 'veal', 'offal', 'prepared', 'seafood'].includes(rawValue);
}

function readRequiredArray(rawValue: unknown, key: string): unknown[] {
  if (!isObject(rawValue)) {
    throw new Error(`Localized cuts catalog entry must be an object for key "${key}"`);
  }

  const value = rawValue[key];
  if (!Array.isArray(value)) {
    throw new Error(`Localized cuts catalog is missing required array "${key}"`);
  }

  return value;
}

function readRequiredString(rawValue: unknown, key: string): string {
  if (!isObject(rawValue)) {
    throw new Error(`Localized cuts catalog entry must be an object for key "${key}"`);
  }

  const value = rawValue[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Localized cuts catalog is missing required string "${key}"`);
  }

  return value.trim();
}

function isObject(rawValue: unknown): rawValue is Record<string, unknown> {
  return typeof rawValue === 'object' && rawValue !== null;
}
