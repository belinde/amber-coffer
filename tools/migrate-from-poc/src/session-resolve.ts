import { parseBulletRefs, type BulletRef } from './frontmatter.js';
import { warn } from './mapping/common.js';
import { normalizeName } from './slug.js';
import type { ExtractContext } from './types.js';

/** Scene labels in session recaps with no canonical location file — skip warnings. */
const SCENE_ONLY_LOCATIONS = new Set([
  normalizeName('Strada e sosta di mezzogiorno'),
  normalizeName('Via dei Coloni'),
  normalizeName('Campo di strage dei bisonti'),
]);

export type SessionEncounterIds = {
  locationIds: string[];
  npcIds: string[];
};

function resolveFromRef(
  ref: BulletRef,
  resolveName: (name: string) => string | undefined,
): string | undefined {
  for (const name of [ref.primary, ...ref.alternateNames]) {
    const id = resolveName(name);
    if (id) return id;
  }
  return undefined;
}

function shouldSkipUnresolvedNpc(ref: BulletRef): boolean {
  if (ref.anonymous) return true;
  const normalized = normalizeName(ref.primary);
  return (
    normalized.includes('signora delle cabine') ||
    normalized.includes('donna sul carro') ||
    normalized.includes('halfling ragazzino') ||
    normalized.includes('uomo armato della fattoria')
  );
}

export function resolveSessionLocationIds(
  ctx: ExtractContext,
  relFile: string,
  sectionBody: string,
): string[] {
  const ids: string[] = [];
  for (const ref of parseBulletRefs(sectionBody)) {
    const id = resolveFromRef(ref, (name) => ctx.registry.resolveLocationName(name));
    if (id) {
      ids.push(id);
      continue;
    }
    if (SCENE_ONLY_LOCATIONS.has(normalizeName(ref.primary))) {
      continue;
    }
    warn(ctx, relFile, `Could not resolve location "${ref.primary}"`);
  }
  return ids;
}

/**
 * Resolves NPC section bullets. Labels that match a location (e.g. steamboat listed as PNG)
 * are returned in `locationIds` instead of `npcIds`.
 */
export function resolveSessionEncounterIds(
  ctx: ExtractContext,
  relFile: string,
  locationSectionBody: string,
  npcSectionBody: string,
): SessionEncounterIds {
  const locationIds = resolveSessionLocationIds(ctx, relFile, locationSectionBody);

  const npcIds: string[] = [];
  for (const ref of parseBulletRefs(npcSectionBody)) {
    const npcId = resolveFromRef(ref, (name) => ctx.registry.resolveNpcName(name));
    if (npcId) {
      npcIds.push(npcId);
      continue;
    }

    const locationId = resolveFromRef(ref, (name) => ctx.registry.resolveLocationName(name));
    if (locationId) {
      locationIds.push(locationId);
      continue;
    }

    if (shouldSkipUnresolvedNpc(ref)) {
      continue;
    }
    warn(ctx, relFile, `Could not resolve NPC "${ref.primary}"`);
  }

  return { locationIds, npcIds };
}

/** @deprecated Use {@link resolveSessionEncounterIds} for recap import. */
export function resolveSessionNpcIds(
  ctx: ExtractContext,
  relFile: string,
  sectionBody: string,
): string[] {
  return resolveSessionEncounterIds(ctx, relFile, '', sectionBody).npcIds;
}
