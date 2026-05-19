import type { Campaign } from '@amber/shared';

import { listCharacters } from '../../bridge/characters.js';
import { listFactions } from '../../bridge/factions.js';
import { listLocations } from '../../bridge/locations.js';
import { listLoreNotes } from '../../bridge/lore-notes.js';
import { listNarrativeSeeds } from '../../bridge/narrative-seeds.js';
import { listNpcs } from '../../bridge/npcs.js';
import { buildTabularRow, type TabularListRow } from '../../components/ui/tabular-list.js';
import {
  imageLinkKey,
  loadCampaignImageLinkIndex,
  pickDisplayImageRef,
} from '../images/campaign-image-links.js';
import { compactJoin, truncatePreview } from '../list-display/format.js';

import type { VaultCategory } from './vault-categories.js';

export type VaultListItem = {
  id: string;
  row: TabularListRow;
};

export type VaultListLabels = {
  visibility: (code: string) => string;
  characterStatus: (code: string) => string;
  characterDiscordPlayer: (playerDiscordId: string | null) => string | undefined;
  npcStatus: (code: string) => string;
  npcDisposition: (code: string) => string;
  npcRecordKind: (code: string) => string;
  factionKind: (code: string) => string;
  loreNoteKind: (code: string) => string;
  seedStatus: (code: string) => string;
  equipCount: (count: number) => string;
  sectionCount: (count: number) => string;
  linkCount: (count: number) => string;
};

type CampaignId = Campaign['id'];

export async function listVaultEntities(
  category: VaultCategory,
  campaignId: CampaignId,
  labels: VaultListLabels,
): Promise<VaultListItem[]> {
  switch (category) {
    case 'characters': {
      const [rows, linkIndex] = await Promise.all([
        listCharacters(campaignId),
        loadCampaignImageLinkIndex(campaignId),
      ]);
      return rows.map((r) => ({
        id: r.id,
        row: buildTabularRow({
          title: r.name,
          subtitle: compactJoin([r.species, r.roleHint]),
          details: [
            labels.characterDiscordPlayer(r.playerDiscordId),
            labels.characterStatus(r.status),
            r.gameSystemHint,
            r.notableEquipment.length > 0
              ? labels.equipCount(r.notableEquipment.length)
              : undefined,
          ].filter((d): d is string => Boolean(d)),
          image: pickDisplayImageRef(r.image, linkIndex.get(imageLinkKey('character', r.id)) ?? []),
          badge: labels.visibility(r.visibility),
        }),
      }));
    }
    case 'npcs': {
      const [rows, linkIndex] = await Promise.all([
        listNpcs(campaignId),
        loadCampaignImageLinkIndex(campaignId),
      ]);
      return rows.map((r) => ({
        id: r.id,
        row: buildTabularRow({
          title: r.name,
          subtitle: compactJoin([r.region, r.scope, r.reminder]),
          details: [
            compactJoin([r.species, r.roleHint]),
            labels.npcStatus(r.status),
            r.disposition ? labels.npcDisposition(r.disposition) : undefined,
            labels.npcRecordKind(r.recordKind),
            truncatePreview(r.description),
          ].filter((d): d is string => Boolean(d)),
          image: pickDisplayImageRef(r.image, linkIndex.get(imageLinkKey('npc', r.id)) ?? []),
          badge: labels.visibility(r.visibility),
        }),
      }));
    }
    case 'locations': {
      const [rows, linkIndex] = await Promise.all([
        listLocations(campaignId),
        loadCampaignImageLinkIndex(campaignId),
      ]);
      return rows.map((r) => ({
        id: r.id,
        row: buildTabularRow({
          title: r.name,
          subtitle: compactJoin([r.region, r.kind]),
          details: [
            r.population,
            truncatePreview(r.description),
            r.sections.length > 0 ? labels.sectionCount(r.sections.length) : undefined,
          ].filter((d): d is string => Boolean(d)),
          image: pickDisplayImageRef(r.image, linkIndex.get(imageLinkKey('location', r.id)) ?? []),
          badge: labels.visibility(r.visibility),
        }),
      }));
    }
    case 'factions': {
      const rows = await listFactions(campaignId);
      return rows.map((r) => ({
        id: r.id,
        row: buildTabularRow({
          title: r.name,
          subtitle: r.kind ? labels.factionKind(r.kind) : undefined,
          details: [truncatePreview(r.goals), truncatePreview(r.description)].filter(
            (d): d is string => Boolean(d),
          ),
          image: r.image,
          badge: labels.visibility(r.visibility),
        }),
      }));
    }
    case 'lore_notes': {
      const rows = await listLoreNotes(campaignId);
      return rows.map((r) => ({
        id: r.id,
        row: buildTabularRow({
          title: r.title,
          subtitle: labels.loreNoteKind(r.kind),
          details: [
            r.tags.length > 0 ? r.tags.slice(0, 4).join(', ') : undefined,
            truncatePreview(r.body, 96),
            r.linkedEntities.length > 0 ? labels.linkCount(r.linkedEntities.length) : undefined,
          ].filter((d): d is string => Boolean(d)),
          badge: labels.visibility(r.visibility),
        }),
      }));
    }
    case 'narrative_seeds': {
      const rows = await listNarrativeSeeds(campaignId);
      return rows.map((r) => ({
        id: r.id,
        row: buildTabularRow({
          title: r.title,
          subtitle: labels.seedStatus(r.status),
          details: [
            truncatePreview(r.summary),
            truncatePreview(r.body ?? undefined),
            r.tags.length > 0 ? r.tags.slice(0, 4).join(', ') : undefined,
            r.linkedEntities.length > 0 ? labels.linkCount(r.linkedEntities.length) : undefined,
          ].filter((d): d is string => Boolean(d)),
          badge: labels.seedStatus(r.status),
        }),
      }));
    }
    default:
      return [];
  }
}
