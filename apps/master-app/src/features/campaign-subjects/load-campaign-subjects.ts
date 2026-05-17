import type { Campaign, Relationship } from '@amber/shared';

import { listCharacters } from '../../bridge/characters.js';
import { listFactions } from '../../bridge/factions.js';
import { listItems } from '../../bridge/items.js';
import { listLocations } from '../../bridge/locations.js';
import { listLoreNotes } from '../../bridge/lore-notes.js';
import { listNarrativeSeeds } from '../../bridge/narrative-seeds.js';
import { listNpcs } from '../../bridge/npcs.js';
import { listRelationships } from '../../bridge/relationships.js';

import type { CampaignSubjectOption } from './types.js';

function lookupLabel(
  options: CampaignSubjectOption[],
  kind: string,
  id: string,
): string | undefined {
  return options.find((o) => o.kind === kind && o.id === id)?.label;
}

function relationshipLabel(
  relationship: Relationship,
  options: CampaignSubjectOption[],
): string {
  const from =
    lookupLabel(options, relationship.fromKind, relationship.fromId) ?? relationship.fromId;
  const to = lookupLabel(options, relationship.toKind, relationship.toId) ?? relationship.toId;
  return `${from} → ${to}`;
}

/** Loads all campaign entities addressable by kind + id fields. */
export async function loadCampaignSubjects(
  campaignId: Campaign['id'],
): Promise<CampaignSubjectOption[]> {
  const [characters, npcs, locations, factions, loreNotes, seeds, items, relationships] =
    await Promise.all([
      listCharacters(campaignId),
      listNpcs(campaignId),
      listLocations(campaignId),
      listFactions(campaignId),
      listLoreNotes(campaignId),
      listNarrativeSeeds(campaignId),
      listItems(campaignId),
      listRelationships(campaignId),
    ]);

  const base: CampaignSubjectOption[] = [
    ...characters.map((c) => ({ kind: 'character', id: c.id, label: c.name })),
    ...npcs.map((n) => ({ kind: 'npc', id: n.id, label: n.name })),
    ...locations.map((l) => ({ kind: 'location', id: l.id, label: l.name })),
    ...factions.map((f) => ({ kind: 'faction', id: f.id, label: f.name })),
    ...loreNotes.map((l) => ({ kind: 'lore_note', id: l.id, label: l.title })),
    ...seeds.map((s) => ({ kind: 'narrative_seed', id: s.id, label: s.title })),
    ...items.map((i) => ({ kind: 'item', id: i.id, label: i.name })),
  ];

  const withRelationships: CampaignSubjectOption[] = [
    ...base,
    ...relationships.map((r) => ({
      kind: 'relationship',
      id: r.id,
      label: relationshipLabel(r, base),
    })),
  ];

  return withRelationships.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}
