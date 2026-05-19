import type { CampaignId, DiscordUserId, SessionId } from '@amber/shared';

/** Fixed UUID v7 placeholders for local dev until handshake provides real ids. */
export const DEMO_CAMPAIGN_ID_RAW = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';
export const DEMO_SESSION_ID_RAW = 'bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb';
export const DEMO_PLAYER_A_RAW = '111111111111111111';
export const DEMO_PLAYER_B_RAW = '222222222222222222';

export const DEMO_CAMPAIGN_ID = DEMO_CAMPAIGN_ID_RAW as unknown as CampaignId;
export const DEMO_SESSION_ID = DEMO_SESSION_ID_RAW as unknown as SessionId;
export const DEMO_PLAYER_A = DEMO_PLAYER_A_RAW as unknown as DiscordUserId;
export const DEMO_PLAYER_B = DEMO_PLAYER_B_RAW as unknown as DiscordUserId;
