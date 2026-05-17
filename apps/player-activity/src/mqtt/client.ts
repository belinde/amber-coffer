import type { CampaignId, MqttMessage, SessionId, SyncChannel } from '@amber/shared';
import {
  buildSyncTopic,
  mqttMessageSchema,
  parseSyncTopic,
  syncEnvelopeMqttSchema,
} from '@amber/shared';

export type MqttMessageHandler = (message: MqttMessage) => void;

/**
 * Typed MQTT subscriber stub for AWS IoT Core.
 * Production implementation will use AWS IoT Device SDK or WebSocket MQTT.
 */
export class MqttSyncClient {
  private readonly handlers = new Map<SyncChannel, Set<MqttMessageHandler>>();

  subscribe(channel: SyncChannel, handler: MqttMessageHandler): () => void {
    const set = this.handlers.get(channel) ?? new Set();
    set.add(handler);
    this.handlers.set(channel, set);
    return () => {
      set.delete(handler);
    };
  }

  /** Parses and validates an incoming MQTT payload (stub — no broker connection yet). */
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

  buildTopic(
    campaignId: CampaignId,
    sessionId: SessionId | null,
    channel: SyncChannel,
  ): string {
    return buildSyncTopic(campaignId, sessionId, channel);
  }
}
