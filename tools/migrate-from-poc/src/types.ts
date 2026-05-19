import type {
  CampaignImage,
  Character,
  Faction,
  Location,
  LoreNote,
  NarrativeSeed,
  Npc,
  Session,
} from '@amber/shared';

import type { AmberMappingFile } from './id-mapping.js';
import type { EntityRegistry } from './registry.js';

export type ExtractWarning = {
  file: string;
  message: string;
};

export type ExtractError = {
  file: string;
  message: string;
  cause?: string;
};

export type DumpAssetEntityKind = 'character' | 'npc' | 'location' | 'faction' | 'campaign_image';

export type DumpAsset = {
  entityKind: DumpAssetEntityKind;
  entityId: string;
  sourcePath: string;
  relativeLocal: string;
};

/** Maps a vault entity portrait to its archive `CampaignImage` row (stable via `.amber-mapping.json`). */
export type PortraitBinding = {
  entityKind: Exclude<DumpAssetEntityKind, 'campaign_image'>;
  entityId: string;
  campaignImageId: string;
};

export type ExtractContext = {
  rootPath: string;
  campaignId: string;
  strict: boolean;
  warnings: ExtractWarning[];
  errors: ExtractError[];
  registry: EntityRegistry;
  mapping: AmberMappingFile;
  assets: DumpAsset[];
  /** Portrait rows for `entities.campaignImages` (merged with session scenes in extract). */
  portraitCampaignImages: CampaignImage[];
  portraitBindings: PortraitBinding[];
  fileCount: number;
};

export type CampaignDumpEntities = {
  characters: Character[];
  npcs: Npc[];
  locations: Location[];
  factions: Faction[];
  loreNotes: LoreNote[];
  narrativeSeeds: NarrativeSeed[];
  sessions: Session[];
  campaignImages: CampaignImage[];
};

export type CampaignDump = {
  version: number;
  sourceMeta: {
    rootPath: string;
    extractedAt: number;
    files: number;
  };
  campaignId: string;
  entities: CampaignDumpEntities;
  assets: DumpAsset[];
  portraitBindings: PortraitBinding[];
  warnings: ExtractWarning[];
  errors: ExtractError[];
};
