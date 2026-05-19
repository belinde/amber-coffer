import { z } from 'zod';

const uuidV7Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const uuidV7Schema = z.string().regex(uuidV7Regex, 'Expected UUID v7');

export const campaignIdSchema = uuidV7Schema.brand<'CampaignId'>();
export const characterIdSchema = uuidV7Schema.brand<'CharacterId'>();
export const npcIdSchema = uuidV7Schema.brand<'NpcId'>();
export const locationIdSchema = uuidV7Schema.brand<'LocationId'>();
export const factionIdSchema = uuidV7Schema.brand<'FactionId'>();
export const itemIdSchema = uuidV7Schema.brand<'ItemId'>();
export const relationshipIdSchema = uuidV7Schema.brand<'RelationshipId'>();
export const sessionIdSchema = uuidV7Schema.brand<'SessionId'>();
export const recordingIdSchema = uuidV7Schema.brand<'RecordingId'>();
export const transcriptIdSchema = uuidV7Schema.brand<'TranscriptId'>();
export const canonDiffIdSchema = uuidV7Schema.brand<'CanonDiffId'>();
export const mapIdSchema = uuidV7Schema.brand<'MapId'>();
export const tokenIdSchema = uuidV7Schema.brand<'TokenId'>();
export const fogRegionIdSchema = uuidV7Schema.brand<'FogRegionId'>();
export const handoutIdSchema = uuidV7Schema.brand<'HandoutId'>();
export const loreNoteIdSchema = uuidV7Schema.brand<'LoreNoteId'>();
export const narrativeSeedIdSchema = uuidV7Schema.brand<'NarrativeSeedId'>();
export const campaignImageIdSchema = uuidV7Schema.brand<'CampaignImageId'>();
export const discordChannelIdSchema = z.string().min(1).brand<'DiscordChannelId'>();
export const discordGuildIdSchema = z.string().min(1).brand<'DiscordGuildId'>();
export const discordUserIdSchema = z.string().min(1).brand<'DiscordUserId'>();

export const entityKindSchema = z.enum([
  'character',
  'npc',
  'location',
  'faction',
  'item',
  'relationship',
  'lore_note',
  'narrative_seed',
]);

export const entityOwnerKindSchema = z.enum(['character', 'npc', 'location', 'faction']);

export const tokenEntityKindSchema = z.enum(['character', 'npc']);
