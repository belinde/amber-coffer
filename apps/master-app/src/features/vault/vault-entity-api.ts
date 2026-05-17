import type { Campaign, Character, Faction, Location, LoreNote, NarrativeSeed, Npc } from '@amber/shared';
import { defaultAppearance, defaultVisibility } from '@amber/shared';

import {
  createCharacter,
  deleteCharacter,
  getCharacter,
  updateCharacter,
  type CreateCharacterInput,
} from '../../bridge/characters.js';
import {
  createFaction,
  deleteFaction,
  getFaction,
  updateFaction,
  type CreateFactionInput,
} from '../../bridge/factions.js';
import {
  createLocation,
  deleteLocation,
  getLocation,
  updateLocation,
  type CreateLocationInput,
} from '../../bridge/locations.js';
import {
  createLoreNote,
  deleteLoreNote,
  getLoreNote,
  updateLoreNote,
  type CreateLoreNoteInput,
} from '../../bridge/lore-notes.js';
import {
  createNarrativeSeed,
  deleteNarrativeSeed,
  getNarrativeSeed,
  updateNarrativeSeed,
  type CreateNarrativeSeedInput,
} from '../../bridge/narrative-seeds.js';
import {
  createNpc,
  deleteNpc,
  getNpc,
  updateNpc,
  type CreateNpcInput,
} from '../../bridge/npcs.js';

import type { VaultCategory } from './vault-categories.js';

type CampaignId = Campaign['id'];
type CharacterId = Character['id'];
type NpcId = Npc['id'];
type LocationId = Location['id'];
type FactionId = Faction['id'];
type LoreNoteId = LoreNote['id'];
type NarrativeSeedId = NarrativeSeed['id'];

export type VaultEntity =
  | CreateCharacterInput
  | CreateNpcInput
  | CreateLocationInput
  | CreateFactionInput
  | CreateLoreNoteInput
  | CreateNarrativeSeedInput;

export async function loadVaultEntity(
  category: VaultCategory,
  entityId: string,
): Promise<VaultEntity | null> {
  switch (category) {
    case 'characters': {
      const row = await getCharacter(entityId as CharacterId);
      if (!row) return null;
      return {
        campaignId: row.campaignId,
        name: row.name,
        playerDiscordId: row.playerDiscordId,
        currentLocationId: row.currentLocationId,
        species: row.species,
        roleHint: row.roleHint,
        appearance: row.appearance,
        gameStats: row.gameStats,
        gameSystemHint: row.gameSystemHint,
        notableEquipment: row.notableEquipment,
        eventsInteresting: row.eventsInteresting,
        image: row.image,
        gmNotes: row.gmNotes,
        visibility: row.visibility,
        status: row.status,
      };
    }
    case 'npcs': {
      const row = await getNpc(entityId as NpcId);
      if (!row) return null;
      return {
        campaignId: row.campaignId,
        name: row.name,
        currentLocationId: row.currentLocationId,
        factionId: row.factionId,
        species: row.species,
        roleHint: row.roleHint,
        region: row.region,
        scope: row.scope,
        reminder: row.reminder,
        recordKind: row.recordKind,
        appearance: row.appearance,
        gameStats: row.gameStats,
        gameSystemHint: row.gameSystemHint,
        notableEquipment: row.notableEquipment,
        linksToCharacters: row.linksToCharacters,
        eventsInteresting: row.eventsInteresting,
        image: row.image,
        gmNotes: row.gmNotes,
        visibility: row.visibility,
        status: row.status,
        disposition: row.disposition,
        description: row.description,
      };
    }
    case 'locations': {
      const row = await getLocation(entityId as LocationId);
      if (!row) return null;
      return {
        campaignId: row.campaignId,
        parentId: row.parentId,
        name: row.name,
        region: row.region,
        kind: row.kind,
        population: row.population,
        appearance: row.appearance,
        sections: row.sections,
        eventsInteresting: row.eventsInteresting,
        image: row.image,
        visibility: row.visibility,
        description: row.description,
        coordinates: row.coordinates,
      };
    }
    case 'factions': {
      const row = await getFaction(entityId as FactionId);
      if (!row) return null;
      return {
        campaignId: row.campaignId,
        name: row.name,
        kind: row.kind,
        parentFactionId: row.parentFactionId,
        headquartersLocationId: row.headquartersLocationId,
        goals: row.goals,
        secrets: row.secrets,
        description: row.description,
        eventsInteresting: row.eventsInteresting,
        image: row.image,
        visibility: row.visibility,
      };
    }
    case 'lore_notes': {
      const row = await getLoreNote(entityId as LoreNoteId);
      if (!row) return null;
      return {
        campaignId: row.campaignId,
        title: row.title,
        kind: row.kind,
        body: row.body,
        tags: row.tags,
        visibility: row.visibility,
        linkedEntities: row.linkedEntities,
      };
    }
    case 'narrative_seeds': {
      const row = await getNarrativeSeed(entityId as NarrativeSeedId);
      if (!row) return null;
      return {
        campaignId: row.campaignId,
        title: row.title,
        summary: row.summary,
        status: row.status,
        body: row.body,
        tags: row.tags,
        linkedEntities: row.linkedEntities,
        firstSessionId: row.firstSessionId,
      };
    }
    default:
      return null;
  }
}

export function emptyVaultEntity(category: VaultCategory, campaignId: CampaignId): VaultEntity {
  const base = { campaignId, visibility: defaultVisibility, appearance: defaultAppearance };
  switch (category) {
    case 'characters':
      return {
        ...base,
        name: '',
        playerDiscordId: null,
        currentLocationId: null,
        species: null,
        roleHint: null,
        gameStats: {},
        gameSystemHint: null,
        notableEquipment: [],
        eventsInteresting: [],
        image: null,
        gmNotes: '',
        status: 'active',
      };
    case 'npcs':
      return {
        ...base,
        name: '',
        currentLocationId: null,
        factionId: null,
        species: null,
        roleHint: null,
        region: null,
        scope: null,
        reminder: null,
        recordKind: 'canonical',
        gameStats: {},
        gameSystemHint: null,
        notableEquipment: [],
        linksToCharacters: [],
        eventsInteresting: [],
        image: null,
        gmNotes: '',
        status: 'alive',
        disposition: null,
        description: null,
      };
    case 'locations':
      return {
        ...base,
        parentId: null,
        name: '',
        region: null,
        kind: null,
        population: null,
        sections: [],
        eventsInteresting: [],
        image: null,
        description: null,
        coordinates: null,
      };
    case 'factions':
      return {
        campaignId,
        name: '',
        kind: null,
        parentFactionId: null,
        headquartersLocationId: null,
        goals: '',
        secrets: '',
        description: null,
        eventsInteresting: [],
        image: null,
        visibility: defaultVisibility,
      };
    case 'lore_notes':
      return {
        campaignId,
        title: '',
        kind: 'concept',
        body: '',
        tags: [],
        visibility: defaultVisibility,
        linkedEntities: [],
      };
    case 'narrative_seeds':
      return {
        campaignId,
        title: '',
        summary: '',
        status: 'idea',
        body: null,
        tags: [],
        linkedEntities: [],
        firstSessionId: null,
      };
    default: {
      const exhaustive: never = category;
      throw new Error('unsupported category: ' + String(exhaustive));
    }
  }
}

export async function saveVaultEntity(
  category: VaultCategory,
  entityId: string | null,
  draft: VaultEntity,
): Promise<string> {
  switch (category) {
    case 'characters': {
      const input = draft as CreateCharacterInput;
      if (entityId) {
        await updateCharacter({ ...input, id: entityId });
        return entityId;
      }
      const created = await createCharacter(input);
      return created.id;
    }
    case 'npcs': {
      const input = draft as CreateNpcInput;
      if (entityId) {
        await updateNpc({ ...input, id: entityId });
        return entityId;
      }
      const created = await createNpc(input);
      return created.id;
    }
    case 'locations': {
      const input = draft as CreateLocationInput;
      if (entityId) {
        await updateLocation({ ...input, id: entityId });
        return entityId;
      }
      const created = await createLocation(input);
      return created.id;
    }
    case 'factions': {
      const input = draft as CreateFactionInput;
      if (entityId) {
        await updateFaction({ ...input, id: entityId });
        return entityId;
      }
      const created = await createFaction(input);
      return created.id;
    }
    case 'lore_notes': {
      const input = draft as CreateLoreNoteInput;
      if (entityId) {
        await updateLoreNote({ ...input, id: entityId });
        return entityId;
      }
      const created = await createLoreNote(input);
      return created.id;
    }
    case 'narrative_seeds': {
      const input = draft as CreateNarrativeSeedInput;
      if (entityId) {
        await updateNarrativeSeed({ ...input, id: entityId });
        return entityId;
      }
      const created = await createNarrativeSeed(input);
      return created.id;
    }
    default: {
      const exhaustive: never = category;
      throw new Error('unsupported category: ' + String(exhaustive));
    }
  }
}

export async function deleteVaultEntity(
  category: VaultCategory,
  entityId: string,
): Promise<void> {
  switch (category) {
    case 'characters':
      return deleteCharacter(entityId as CharacterId);
    case 'npcs':
      return deleteNpc(entityId as NpcId);
    case 'locations':
      return deleteLocation(entityId as LocationId);
    case 'factions':
      return deleteFaction(entityId as FactionId);
    case 'lore_notes':
      return deleteLoreNote(entityId as LoreNoteId);
    case 'narrative_seeds':
      return deleteNarrativeSeed(entityId as NarrativeSeedId);
    default: {
      const exhaustive: never = category;
      throw new Error('unsupported category: ' + String(exhaustive));
    }
  }
}

export function entityDisplayName(category: VaultCategory, draft: VaultEntity): string {
  if (category === 'lore_notes' || category === 'narrative_seeds') {
    return (draft as CreateLoreNoteInput).title || '—';
  }
  return (draft as CreateCharacterInput).name || '—';
}
