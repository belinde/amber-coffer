import type { VaultCategory } from './vault-categories.js';

export type SectionId =
  | 'identity'
  | 'operational'
  | 'appearance'
  | 'visual'
  | 'linkedImages'
  | 'equipment'
  | 'gameStats'
  | 'characterLinks'
  | 'events'
  | 'gmNotes'
  | 'visibility'
  | 'sections'
  | 'goals'
  | 'metadata'
  | 'body'
  | 'links'
  | 'idea';

export type EntitySectionConfig = {
  id: SectionId;
  labelKey: string;
};

const CHARACTER_SECTIONS: EntitySectionConfig[] = [
  { id: 'identity', labelKey: 'vault.sections.identity' },
  { id: 'appearance', labelKey: 'vault.sections.appearance' },
  { id: 'equipment', labelKey: 'vault.sections.equipment' },
  { id: 'gameStats', labelKey: 'vault.sections.gameStats' },
  { id: 'events', labelKey: 'vault.sections.events' },
  { id: 'gmNotes', labelKey: 'vault.sections.gmNotes' },
];

const NPC_SECTIONS: EntitySectionConfig[] = [
  { id: 'identity', labelKey: 'vault.sections.identity' },
  { id: 'operational', labelKey: 'vault.sections.operational' },
  { id: 'appearance', labelKey: 'vault.sections.appearance' },
  { id: 'characterLinks', labelKey: 'vault.sections.characterLinks' },
  { id: 'equipment', labelKey: 'vault.sections.equipment' },
  { id: 'gameStats', labelKey: 'vault.sections.gameStats' },
  { id: 'events', labelKey: 'vault.sections.events' },
  { id: 'gmNotes', labelKey: 'vault.sections.gmNotes' },
];

const LOCATION_SECTIONS: EntitySectionConfig[] = [
  { id: 'identity', labelKey: 'vault.sections.identity' },
  { id: 'appearance', labelKey: 'vault.sections.appearance' },
  { id: 'sections', labelKey: 'vault.sections.freeSections' },
  { id: 'events', labelKey: 'vault.sections.events' },
];

const FACTION_SECTIONS: EntitySectionConfig[] = [
  { id: 'identity', labelKey: 'vault.sections.identity' },
  { id: 'goals', labelKey: 'vault.sections.goals' },
  { id: 'events', labelKey: 'vault.sections.events' },
  { id: 'visibility', labelKey: 'vault.sections.visibility' },
];

const LORE_SECTIONS: EntitySectionConfig[] = [
  { id: 'metadata', labelKey: 'vault.sections.metadata' },
  { id: 'body', labelKey: 'vault.sections.body' },
  { id: 'links', labelKey: 'vault.sections.links' },
  { id: 'visibility', labelKey: 'vault.sections.visibility' },
];

const SEED_SECTIONS: EntitySectionConfig[] = [
  { id: 'idea', labelKey: 'vault.sections.idea' },
  { id: 'body', labelKey: 'vault.sections.detail' },
  { id: 'links', labelKey: 'vault.sections.links' },
];

export function sectionsForCategory(category: VaultCategory): EntitySectionConfig[] {
  switch (category) {
    case 'characters':
      return CHARACTER_SECTIONS;
    case 'npcs':
      return NPC_SECTIONS;
    case 'locations':
      return LOCATION_SECTIONS;
    case 'factions':
      return FACTION_SECTIONS;
    case 'lore_notes':
      return LORE_SECTIONS;
    case 'narrative_seeds':
      return SEED_SECTIONS;
    default:
      return [];
  }
}
