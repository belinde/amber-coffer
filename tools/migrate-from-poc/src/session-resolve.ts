import { parseBulletRefs, type BulletRef } from './frontmatter.js';
import { normalizeName } from './slug.js';
import type { ExtractContext } from './types.js';
import { warn } from './mapping/common.js';

/** Scene labels in session recaps with no canonical location file — skip warnings. */
const SCENE_ONLY_LOCATIONS = new Set([
  normalizeName('Strada e sosta di mezzogiorno'),
  normalizeName('Via dei Coloni'),
  normalizeName('Campo di strage dei bisonti'),
]);

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

export function resolveSessionNpcIds(
  ctx: ExtractContext,
  relFile: string,
  sectionBody: string,
): string[] {
  const ids: string[] = [];
  for (const ref of parseBulletRefs(sectionBody)) {
    const id = resolveFromRef(ref, (name) => {
      return ctx.registry.resolveNpcName(name) ?? ctx.registry.resolveLocationName(name);
    });
    if (id) {
      ids.push(id);
      continue;
    }
    if (shouldSkipUnresolvedNpc(ref)) {
      continue;
    }
    warn(ctx, relFile, `Could not resolve NPC "${ref.primary}"`);
  }
  return ids;
}
