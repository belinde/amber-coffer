declare const brand: unique symbol;

/** Nominal typing for domain identifiers. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type CampaignId = Brand<string, 'CampaignId'>;
export type CharacterId = Brand<string, 'CharacterId'>;
export type NpcId = Brand<string, 'NpcId'>;
export type LocationId = Brand<string, 'LocationId'>;
export type FactionId = Brand<string, 'FactionId'>;
export type ItemId = Brand<string, 'ItemId'>;
export type RelationshipId = Brand<string, 'RelationshipId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type RecordingId = Brand<string, 'RecordingId'>;
export type SessionDiscordAssignmentId = Brand<string, 'SessionDiscordAssignmentId'>;
export type TranscriptId = Brand<string, 'TranscriptId'>;
export type CanonDiffId = Brand<string, 'CanonDiffId'>;
export type MapId = Brand<string, 'MapId'>;
export type TokenId = Brand<string, 'TokenId'>;
export type FogRegionId = Brand<string, 'FogRegionId'>;
export type HandoutId = Brand<string, 'HandoutId'>;
export type LoreNoteId = Brand<string, 'LoreNoteId'>;
export type NarrativeSeedId = Brand<string, 'NarrativeSeedId'>;
export type CampaignImageId = Brand<string, 'CampaignImageId'>;
export type DiscordChannelId = Brand<string, 'DiscordChannelId'>;
export type DiscordUserId = Brand<string, 'DiscordUserId'>;

export type EntityKind = 'character' | 'npc' | 'location' | 'faction' | 'item' | 'relationship';

export type EntityOwnerKind = 'character' | 'npc' | 'location' | 'faction';

export type TokenEntityKind = 'character' | 'npc' | 'custom';
