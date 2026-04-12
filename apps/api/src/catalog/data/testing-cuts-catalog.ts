import type { AgentCatalogItem } from '@meatland/shared-types';

import rawLocalizedCuts from './cuts.he.json';

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
  return TESTING_LOCALIZED_CUTS_CATALOG.species.flatMap((species) =>
    species.primals.flatMap((primal) =>
      primal.groups.flatMap((group) =>
        group.cuts.map((cut) => ({
          itemId: cut.itemId,
          sku: cut.sku,
          name: cut.nameEn,
          unit: cut.unit,
          isActive: true,
          category: cut.category,
          isTestingOnly: true,
        })),
      ),
    ),
  );
}

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
          if (unit !== 'kg' && unit !== 'unit') {
            throw new Error(`Unsupported unit "${unit}" for item "${itemId}"`);
          }
          const normalizedUnit: AgentCatalogItem['unit'] = unit;

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
    species,
  };
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
