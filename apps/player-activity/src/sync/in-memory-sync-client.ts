import type { CampaignId, MqttMessage, SessionId, SyncChannel } from '@amber/shared';
import {
  buildSyncTopic,
  mqttMessageSchema,
  parseSyncTopic,
  syncEnvelopeMqttSchema,
} from '@amber/shared';

import type { SyncClientLike } from './types.js';

export type SyncMessageHandler = (message: MqttMessage) => void;

/**
 * In-memory sync stub for local dev (injects envelopes without AWS).
 */
export class InMemorySyncClient implements SyncClientLike {
  private readonly handlers = new Map<SyncChannel, Set<SyncMessageHandler>>();

  subscribe(channel: SyncChannel, handler: SyncMessageHandler): () => void {
    const set = this.handlers.get(channel) ?? new Set();
    set.add(handler);
    this.handlers.set(channel, set);
    return () => {
      set.delete(handler);
    };
  }

  handleRawPayload(topic: string, raw: string): void {
    const parsed = parseSyncTopic(topic);
    if (!parsed) {
      return;
    }
    const json: unknown = JSON.parse(raw);
    const envelope = syncEnvelopeMqttSchema.parse(json);
    const payload = mqttMessageSchema.parse(envelope.payload);
    const handlers = this.handlers.get(parsed.channel);
    if (handlers) {
      for (const handler of handlers) {
        handler(payload);
      }
    }
  }

  buildTopic(campaignId: CampaignId, sessionId: SessionId | null, channel: SyncChannel): string {
    return buildSyncTopic(campaignId, sessionId, channel);
  }

  publish(topic: string, raw: string): void {
    this.handleRawPayload(topic, raw);
  }
}
