import type { CampaignId, DiscordUserId, SessionId } from '../ids/branded.js';

/** MQTT sync envelope wrapping a typed payload. */
export interface SyncEnvelope<TPayload> {
  readonly v: 1;
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId | null;
  readonly senderRole: 'master' | 'player';
  readonly senderId: DiscordUserId;
  /** Monotonic sequence number per campaign. */
  readonly seq: number;
  /** Epoch milliseconds (aligned with UUID v7 timestamp). */
  readonly timestamp: number;
  readonly payload: TPayload;
}
