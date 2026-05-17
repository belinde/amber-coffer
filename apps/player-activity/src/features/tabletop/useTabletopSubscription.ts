import type { CampaignId, SessionId, SyncChannel } from '@amber/shared';
import { useEffect } from 'react';

import type { MqttSyncClient } from '../../mqtt/client.js';

import { tabletopStore } from './store.js';

/**
 * Wires the Player Activity to the MQTT topics that feed the tabletop view.
 *
 * Subscribes to the channels relevant for the table: `tokens`, `maps`, `handouts`, `snapshot`.
 * On every payload the typed envelope is forwarded to `tabletopStore`.
 *
 * The MQTT broker connection itself is a stub (see `MqttSyncClient`); this hook only
 * orchestrates the in-memory pub/sub for now.
 */
export function useTabletopSubscription(args: {
  client: MqttSyncClient;
  campaignId: CampaignId;
  sessionId: SessionId;
}): void {
  const { client } = args;

  useEffect(() => {
    const channels: SyncChannel[] = ['snapshot', 'tokens', 'maps', 'handouts', 'control'];
    const unsubscribers = channels.map((channel) =>
      client.subscribe(channel, (payload) => {
        tabletopStore.applyMqttMessage(payload);
      }),
    );
    return () => {
      for (const off of unsubscribers) off();
    };
  }, [client]);
}
