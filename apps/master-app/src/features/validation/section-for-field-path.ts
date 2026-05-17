import type { SectionId } from '../vault/entity-sections.config.js';
import { sectionsForCategory } from '../vault/entity-sections.config.js';
import type { VaultCategory } from '../vault/vault-categories.js';

/** Top-level field prefixes owned by each vault section tab. */
const SECTION_FIELD_PREFIXES: Record<SectionId, readonly string[]> = {
  identity: [
    'name',
    'title',
    'playerDiscordId',
    'species',
    'roleHint',
    'status',
    'region',
    'scope',
    'reminder',
    'recordKind',
    'disposition',
    'description',
    'kind',
    'parentId',
    'population',
    'parentFactionId',
    'headquartersLocationId',
    'summary',
    'firstSessionId',
    'visibility',
  ],
  operational: ['region', 'scope', 'reminder', 'currentLocationId', 'factionId'],
  appearance: ['appearance', 'image'],
  visual: ['image', 'appearance.visualReference'],
  linkedImages: [],
  equipment: ['notableEquipment'],
  gameStats: ['gameStats'],
  characterLinks: ['linksToCharacters'],
  events: ['eventsInteresting'],
  gmNotes: ['gmNotes', 'secrets'],
  visibility: ['visibility'],
  sections: ['sections'],
  goals: ['goals'],
  metadata: ['kind', 'tags', 'loreKind'],
  body: ['body'],
  links: ['linkedEntities'],
  idea: ['summary', 'status'],
};

function pathMatchesPrefix(pathKey: string, prefix: string): boolean {
  return pathKey === prefix || pathKey.startsWith(`${prefix}.`);
}

export function sectionForFieldPath(category: VaultCategory, pathKey: string): SectionId | null {
  const sections = sectionsForCategory(category);
  for (const section of sections) {
    const prefixes = SECTION_FIELD_PREFIXES[section.id] ?? [];
    if (prefixes.some((prefix) => pathMatchesPrefix(pathKey, prefix))) {
      return section.id;
    }
  }
  return null;
}

export function firstSectionWithFieldErrors(
  category: VaultCategory,
  fieldErrorKeys: string[],
): SectionId | null {
  const sections = sectionsForCategory(category);
  for (const section of sections) {
    const prefixes = SECTION_FIELD_PREFIXES[section.id] ?? [];
    const hasError = fieldErrorKeys.some((pathKey) =>
      prefixes.some((prefix) => pathMatchesPrefix(pathKey, prefix)),
    );
    if (hasError) return section.id;
  }
  return sections[0]?.id ?? null;
}

export function sectionHasFieldError(
  _category: VaultCategory,
  sectionId: SectionId,
  fieldErrorKeys: string[],
): boolean {
  const prefixes = SECTION_FIELD_PREFIXES[sectionId] ?? [];
  return fieldErrorKeys.some((pathKey) =>
    prefixes.some((prefix) => pathMatchesPrefix(pathKey, prefix)),
  );
}
