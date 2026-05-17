import type { CampaignId, SessionId } from '../ids/branded.js';

/** MQTT topic channels for real-time sync. */
export type SyncChannel =
  | 'tokens'
  | 'fog'
  | 'maps'
  | 'entities'
  | 'control'
  | 'handouts'
  | 'snapshot';

const TOPIC_PREFIX = 'amber-coffer';

/**
 * Builds an MQTT topic: amber-coffer/{campaignId}/{sessionId|_}/{channel}
 */
export function buildSyncTopic(
  campaignId: CampaignId,
  sessionId: SessionId | null,
  channel: SyncChannel,
): string {
  const sessionSegment = sessionId ?? '_';
  return `${TOPIC_PREFIX}/${campaignId}/${sessionSegment}/${channel}`;
}

/**
 * Parses a sync topic into its components. Returns null if the format is invalid.
 */
export function parseSyncTopic(topic: string): {
  campaignId: string;
  sessionId: string | null;
  channel: SyncChannel;
} | null {
  const parts = topic.split('/');
  if (parts.length !== 4 || parts[0] !== TOPIC_PREFIX) {
    return null;
  }
  const [, campaignId, sessionSegment, channel] = parts;
  if (!campaignId || !sessionSegment || !channel) {
    return null;
  }
  const validChannels: SyncChannel[] = [
    'tokens',
    'fog',
    'maps',
    'entities',
    'control',
    'handouts',
    'snapshot',
  ];
  if (!validChannels.includes(channel as SyncChannel)) {
    return null;
  }
  return {
    campaignId,
    sessionId: sessionSegment === '_' ? null : sessionSegment,
    channel: channel as SyncChannel,
  };
}
