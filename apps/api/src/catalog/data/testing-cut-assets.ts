import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export type TestingCutSpecies = 'beef' | 'chicken' | 'lamb';

type TestingCutAssetRecord = {
  species: TestingCutSpecies;
  fileName: string;
  stem: string;
  relativePath: string;
  absolutePath: string;
  contentType: string;
  tokens: string[];
  sizeBytes: number;
  modifiedAtMs: number;
};

export type ResolvedTestingCutAsset = {
  species: TestingCutSpecies;
  fileName: string;
  relativePath: string;
  absolutePath: string;
  contentType: string;
  etag: string;
};

type TestingCutAssetManifest = {
  rootDirectory: string | null;
  version: string;
  recordsBySpecies: Record<TestingCutSpecies, TestingCutAssetRecord[]>;
  recordsByStem: Map<string, TestingCutAssetRecord>;
  recordsByPath: Map<string, TestingCutAssetRecord>;
};

const SUPPORTED_FILE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const SPECIES: TestingCutSpecies[] = ['beef', 'chicken', 'lamb'];
const ITEM_ID_PREFIX_PATTERN = /^(itm|item)[-_]?/;
const TOKEN_STOPWORDS = new Set([
  'and',
  'of',
  'with',
  'without',
  'for',
  'the',
  'in',
  'to',
  'on',
  'cut',
  'piece',
  'skin',
  'bone',
]);

const ITEM_ID_ASSET_ALIASES: Record<string, string> = {
  'itm-beef-entrecote': 'beef_ribeye_steak_boneless',
  'itm-beef-mince': 'beef_ground_80_20',
  'itm-lamb-ribs': 'lamb_rib_chops',
  'itm-beef-ribeye': 'beef_ribeye_steak_boneless',
  'itm-beef-brisket': 'beef_whole_packer_brisket',
  'itm-beef-tenderloin': 'beef_filet_mignon',
  'itm-beef-striploin': 'beef_strip_steak',
  'itm-beef-short-ribs': 'beef_chuck_short_ribs',
  'itm-beef-osso-buco': 'beef_cross_cut_shanks',
  'itm-beef-picanha': 'beef_coulotte_steak',
  'itm-lamb-chops': 'lamb_loin_chops',
  'itm-lamb-shoulder': 'lamb_square_cut_shoulder_roast',
  'itm-lamb-shank': 'lamb_hindshank',
  'itm-chicken-breast': 'chicken_boneless_skinless_breast',
  'itm-chicken-thigh': 'chicken_thigh_bone_in_skin_on',
  'itm-chicken-drumstick': 'chicken_drumstick',
  'itm-chicken-wing': 'chicken_whole_wing',
  'itm-chicken-whole': 'chicken_whole_roaster',
  'itm-chicken-bones': 'chicken_backs',
  'itm-chicken-schnitzel': 'chicken_boneless_skinless_breast',
  'itm-lamb-mince': 'lamb_ground',
  'itm-beef-bones': 'beef_marrow_bones',
  'itm-beef-burger-patty': 'beef_ground_80_20',
  'itm-beef-smoked-brisket': 'beef_brisket_flat',
  beef_ribeye_steak: 'beef_ribeye_steak_boneless',
};

const CUT_NAME_ASSET_OVERRIDES: Record<string, string> = {
  'boneless leg of lamb (rolled and tied)': 'lamb_boneless_leg',
  'loin roast (saddle of lamb)': 'lamb_loin_roast',
  'whole rack of lamb': 'lamb_whole_rack',
  'frenched rack of lamb': 'lamb_frenched_rack',
  'square-cut shoulder roast (bone-in)': 'lamb_square_cut_shoulder_roast',
  'rolled shoulder roast (boneless)': 'lamb_rolled_shoulder_roast',
  'wing tip': 'chicken_wing_tip',
};

const TESTING_CUT_ASSETS_MANIFEST = createManifest();

export function getTestingCutAssetsVersion(): string {
  return TESTING_CUT_ASSETS_MANIFEST.version;
}

export function listTestingCutAssetItemIds(): string[] {
  const itemIds: string[] = [];
  for (const species of SPECIES) {
    for (const record of TESTING_CUT_ASSETS_MANIFEST.recordsBySpecies[species]) {
      itemIds.push(record.stem);
    }
  }
  return itemIds;
}

export function resolveTestingCutAssetByPath(
  species: string,
  fileName: string,
): ResolvedTestingCutAsset | null {
  if (!isTestingCutSpecies(species)) {
    return null;
  }

  const normalizedKey = `${species}/${fileName.trim().toLowerCase()}`;
  const record = TESTING_CUT_ASSETS_MANIFEST.recordsByPath.get(normalizedKey);
  return record ? toResolvedAsset(record) : null;
}

export function resolveTestingCutAssetByItemId(itemId: string): ResolvedTestingCutAsset | null {
  const normalizedItemId = itemId.trim().toLowerCase();
  if (!normalizedItemId) {
    return null;
  }

  const aliasStem = ITEM_ID_ASSET_ALIASES[normalizedItemId];
  if (aliasStem) {
    const exactAlias = TESTING_CUT_ASSETS_MANIFEST.recordsByStem.get(aliasStem);
    if (exactAlias) {
      return toResolvedAsset(exactAlias);
    }
  }

  const species = inferSpeciesFromItemIdentifier(normalizedItemId);
  if (!species) {
    return null;
  }

  const canonicalSlug = normalizeIdentifierToSlug(normalizedItemId);
  const speciesScopedSlug = canonicalSlug.startsWith(`${species}_`) ? canonicalSlug : `${species}_${canonicalSlug}`;
  const bySlug = findAssetBySlug(species, speciesScopedSlug);
  if (bySlug) {
    return toResolvedAsset(bySlug);
  }

  const tokens = normalizeTokens(speciesScopedSlug);
  const byTokens = findBestAssetByTokenOverlap(species, tokens);
  if (byTokens) {
    return toResolvedAsset(byTokens);
  }

  const speciesFallback = TESTING_CUT_ASSETS_MANIFEST.recordsBySpecies[species][0];
  return speciesFallback ? toResolvedAsset(speciesFallback) : null;
}

export function resolveTestingCutAssetByName(
  species: TestingCutSpecies,
  nameEn: string,
): ResolvedTestingCutAsset | null {
  const normalizedName = nameEn.trim().toLowerCase();
  if (!normalizedName) {
    return null;
  }

  const overrideStem = CUT_NAME_ASSET_OVERRIDES[normalizedName];
  if (overrideStem) {
    const override = TESTING_CUT_ASSETS_MANIFEST.recordsByStem.get(overrideStem);
    if (override) {
      return toResolvedAsset(override);
    }
  }

  const slugCandidates = buildSlugCandidatesFromCutName(species, normalizedName);
  for (const slug of slugCandidates) {
    const bySlug = findAssetBySlug(species, slug);
    if (bySlug) {
      return toResolvedAsset(bySlug);
    }
  }

  const tokens = normalizeTokens(
    slugCandidates[0] ?? `${species}_${normalizedName.replace(/[^a-z0-9]+/g, '_')}`,
  );
  const byTokens = findBestAssetByTokenOverlap(species, tokens);
  if (byTokens) {
    return toResolvedAsset(byTokens);
  }

  const speciesFallback = TESTING_CUT_ASSETS_MANIFEST.recordsBySpecies[species][0];
  return speciesFallback ? toResolvedAsset(speciesFallback) : null;
}

function createManifest(): TestingCutAssetManifest {
  const rootDirectory = resolveTestingCutAssetsRootDirectory();
  const recordsBySpecies: TestingCutAssetManifest['recordsBySpecies'] = {
    beef: [],
    chicken: [],
    lamb: [],
  };
  const recordsByStem = new Map<string, TestingCutAssetRecord>();
  const recordsByPath = new Map<string, TestingCutAssetRecord>();

  if (!rootDirectory) {
    return {
      rootDirectory: null,
      version: 'missing-assets',
      recordsBySpecies,
      recordsByStem,
      recordsByPath,
    };
  }

  for (const species of SPECIES) {
    const directoryPath = path.join(rootDirectory, species);
    if (!existsSync(directoryPath)) {
      continue;
    }

    for (const fileName of readdirSync(directoryPath).sort((left, right) => left.localeCompare(right))) {
      const extension = path.extname(fileName).toLowerCase();
      if (!SUPPORTED_FILE_EXTENSIONS.has(extension)) {
        continue;
      }

      const absolutePath = path.join(directoryPath, fileName);
      const relativePath = `${species}/${fileName}`.toLowerCase();
      const stem = fileName.slice(0, -extension.length).toLowerCase();
      const stats = statSync(absolutePath);
      const record: TestingCutAssetRecord = {
        species,
        fileName,
        stem,
        relativePath,
        absolutePath,
        contentType: detectContentType(absolutePath, extension),
        tokens: normalizeTokens(stem),
        sizeBytes: stats.size,
        modifiedAtMs: stats.mtimeMs,
      };

      recordsBySpecies[species].push(record);
      recordsByStem.set(stem, record);
      recordsByPath.set(relativePath, record);
    }
  }

  const versionHash = createHash('sha256');
  for (const species of SPECIES) {
    for (const record of recordsBySpecies[species]) {
      versionHash.update(record.relativePath);
      versionHash.update(':');
      versionHash.update(String(record.sizeBytes));
      versionHash.update(':');
      versionHash.update(String(Math.trunc(record.modifiedAtMs)));
      versionHash.update('|');
    }
  }

  return {
    rootDirectory,
    version: versionHash.digest('hex').slice(0, 12),
    recordsBySpecies,
    recordsByStem,
    recordsByPath,
  };
}

function resolveTestingCutAssetsRootDirectory(): string | null {
  const fromEnvironment = process.env.TESTING_CUT_IMAGES_DIR?.trim();
  if (fromEnvironment && existsSync(fromEnvironment)) {
    return fromEnvironment;
  }

  const candidateDirectories = [
    path.resolve(process.cwd(), 'apps/api/public/testing-cuts-images'),
    path.resolve(process.cwd(), 'public/testing-cuts-images'),
    path.resolve(process.cwd(), 'images'),
    path.resolve(__dirname, '../../../public/testing-cuts-images'),
    path.resolve(__dirname, '../../../../public/testing-cuts-images'),
    path.resolve(__dirname, '../../../../../public/testing-cuts-images'),
    path.resolve(__dirname, '../../../../../images'),
  ];

  for (const candidate of candidateDirectories) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function findAssetBySlug(species: TestingCutSpecies, slug: string): TestingCutAssetRecord | null {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) {
    return null;
  }

  const exact = TESTING_CUT_ASSETS_MANIFEST.recordsByStem.get(normalizedSlug);
  if (exact && exact.species === species) {
    return exact;
  }

  const prefixed = TESTING_CUT_ASSETS_MANIFEST.recordsBySpecies[species]
    .filter((record) => record.stem.startsWith(`${normalizedSlug}_`))
    .sort((left, right) => left.stem.length - right.stem.length);
  return prefixed[0] ?? null;
}

function findBestAssetByTokenOverlap(
  species: TestingCutSpecies,
  tokens: string[],
): TestingCutAssetRecord | null {
  const uniqueTokens = [...new Set(tokens)].filter((token) => token.length > 0 && !TOKEN_STOPWORDS.has(token));
  if (uniqueTokens.length === 0) {
    return null;
  }

  let bestMatch: { record: TestingCutAssetRecord; score: number } | null = null;
  for (const record of TESTING_CUT_ASSETS_MANIFEST.recordsBySpecies[species]) {
    let overlapCount = 0;
    for (const token of uniqueTokens) {
      if (record.tokens.includes(token)) {
        overlapCount += 1;
      }
    }

    if (overlapCount === 0) {
      continue;
    }

    const score = overlapCount * 10 - Math.abs(record.tokens.length - uniqueTokens.length);
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { record, score };
    }
  }

  return bestMatch?.record ?? null;
}

function buildSlugCandidatesFromCutName(species: TestingCutSpecies, cutNameEn: string): string[] {
  const withParentheticalWords = toSlug(cutNameEn);
  const withoutParentheticalWords = toSlug(cutNameEn.replace(/\([^)]*\)/g, ' '));

  const candidates = new Set<string>();
  for (const rawCandidate of [withParentheticalWords, withoutParentheticalWords]) {
    const speciesStripped = rawCandidate
      .replace(new RegExp(`(^|_)${species}(?=_|$)`, 'g'), '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '');
    if (speciesStripped) {
      candidates.add(`${species}_${speciesStripped}`);
    }
  }

  return [...candidates];
}

function normalizeIdentifierToSlug(value: string): string {
  return toSlug(value.replace(ITEM_ID_PREFIX_PATTERN, ''));
}

function inferSpeciesFromItemIdentifier(itemId: string): TestingCutSpecies | null {
  if (itemId.includes('beef')) {
    return 'beef';
  }
  if (itemId.includes('chicken')) {
    return 'chicken';
  }
  if (itemId.includes('lamb')) {
    return 'lamb';
  }
  return null;
}

function normalizeTokens(value: string): string[] {
  return toSlug(value)
    .split('_')
    .filter((token) => token.length > 0)
    .map((token) => (token.endsWith('s') && token.length > 3 ? token.slice(0, -1) : token));
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function extensionToContentType(extension: string): string {
  if (extension === '.png') {
    return 'image/png';
  }
  if (extension === '.webp') {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function detectContentType(absolutePath: string, extension: string): string {
  try {
    const signature = Buffer.alloc(16);
    const descriptor = openSync(absolutePath, 'r');
    try {
      readSync(descriptor, signature, 0, 16, 0);
    } finally {
      closeSync(descriptor);
    }
    if (
      signature.length >= 8 &&
      signature[0] === 0x89 &&
      signature[1] === 0x50 &&
      signature[2] === 0x4e &&
      signature[3] === 0x47 &&
      signature[4] === 0x0d &&
      signature[5] === 0x0a &&
      signature[6] === 0x1a &&
      signature[7] === 0x0a
    ) {
      return 'image/png';
    }

    if (signature.length >= 3 && signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff) {
      return 'image/jpeg';
    }

    if (
      signature.length >= 12 &&
      signature[0] === 0x52 &&
      signature[1] === 0x49 &&
      signature[2] === 0x46 &&
      signature[3] === 0x46 &&
      signature[8] === 0x57 &&
      signature[9] === 0x45 &&
      signature[10] === 0x42 &&
      signature[11] === 0x50
    ) {
      return 'image/webp';
    }
  } catch {
    return extensionToContentType(extension);
  }

  return extensionToContentType(extension);
}

function isTestingCutSpecies(value: string): value is TestingCutSpecies {
  return value === 'beef' || value === 'chicken' || value === 'lamb';
}

function toResolvedAsset(record: TestingCutAssetRecord): ResolvedTestingCutAsset {
  const etag = createHash('sha256')
    .update(record.relativePath)
    .update(':')
    .update(String(record.sizeBytes))
    .update(':')
    .update(String(Math.trunc(record.modifiedAtMs)))
    .digest('hex')
    .slice(0, 16);

  return {
    species: record.species,
    fileName: record.fileName,
    relativePath: record.relativePath,
    absolutePath: record.absolutePath,
    contentType: record.contentType,
    etag: `W/"${etag}"`,
  };
}
