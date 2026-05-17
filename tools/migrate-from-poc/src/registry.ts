import { normalizeName, slugify } from './slug.js';

export type RegistryKind =
  | 'character'
  | 'npc'
  | 'location'
  | 'faction'
  | 'lore_note'
  | 'narrative_seed'
  | 'session';

export type RegistryEntry = {
  kind: RegistryKind;
  id: string;
  name: string;
  slug: string;
};

export class EntityRegistry {
  private readonly bySlug = new Map<string, RegistryEntry>();
  private readonly byNormalizedName = new Map<string, RegistryEntry>();
  private readonly aliasToId = new Map<string, string>();
  private readonly sessionsByNumber = new Map<number, RegistryEntry>();

  register(entry: RegistryEntry): void {
    this.bySlug.set(entry.slug, entry);
    this.byNormalizedName.set(normalizeName(entry.name), entry);
    if (entry.kind === 'session') {
      const num = Number.parseInt(entry.slug.replace(/^sessione-/, ''), 10);
      if (!Number.isNaN(num)) {
        this.sessionsByNumber.set(num, entry);
      }
    }
  }

  getBySlug(slug: string): RegistryEntry | undefined {
    return this.bySlug.get(slug);
  }

  /** Maps a recap label (e.g. "Il Mississippi") to a canonical entity id. */
  registerAlias(alias: string, id: string): void {
    this.aliasToId.set(normalizeName(alias), id);
  }

  sessionIdForNumber(number: number): string | undefined {
    return this.sessionsByNumber.get(number)?.id;
  }

  resolveName(name: string, kinds?: RegistryKind[]): string | undefined {
    const normalized = normalizeName(name);
    const aliasId = this.aliasToId.get(normalized);
    if (aliasId) {
      return aliasId;
    }

    const direct = this.byNormalizedName.get(normalized);
    if (direct && (!kinds || kinds.includes(direct.kind))) {
      return direct.id;
    }

    for (const [key, entry] of this.byNormalizedName) {
      if (!kinds || kinds.includes(entry.kind)) {
        if (key.includes(normalized) || normalized.includes(key)) {
          return entry.id;
        }
      }
    }
    return undefined;
  }

  resolveCharacterName(name: string): string | undefined {
    return this.resolveName(name, ['character']);
  }

  resolveNpcName(name: string): string | undefined {
    return this.resolveName(name, ['npc']);
  }

  resolveLocationName(name: string): string | undefined {
    return this.resolveName(name, ['location']);
  }

  slugForTitle(title: string): string {
    return slugify(title);
  }
}
