import type { CampaignId, SessionId, SyncChannel } from '@amber/shared';

import type { SyncMessageHandler } from './in-memory-sync-client.js';

/** Shared surface for in-memory dev stub and HTTP poll sync client. */
export type SyncClientLike = {
  subscribe(channel: SyncChannel, handler: SyncMessageHandler): () => void;
  buildTopic(campaignId: CampaignId, sessionId: SessionId | null, channel: SyncChannel): string;
  publish(topic: string, raw: string): void;
};
