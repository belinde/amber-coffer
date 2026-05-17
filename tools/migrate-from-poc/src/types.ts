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

export type DumpAssetEntityKind =
  | 'character'
  | 'npc'
  | 'location'
  | 'faction'
  | 'campaign_image';

export type DumpAsset = {
  entityKind: DumpAssetEntityKind;
  entityId: string;
  sourcePath: string;
  relativeLocal: string;
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
  warnings: ExtractWarning[];
  errors: ExtractError[];
};
