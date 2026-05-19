import type { CampaignId, SessionId, SyncChannel } from '@amber/shared';
import { useEffect } from 'react';

import type { SyncClientLike } from '../../sync/types.js';

import { tabletopStore } from './store.js';

/**
 * Wires the Player Activity to the MQTT topics that feed the tabletop view.
 *
 * Subscribes to the channels relevant for the table: `tokens`, `maps`, `handouts`, `snapshot`.
 * On every payload the typed envelope is forwarded to `tabletopStore`.
 *
 * Wires snapshot/token/handout handlers from the active sync transport (HTTP poll or dev stub).
 */
export function useTabletopSubscription(args: {
  client: SyncClientLike;
  campaignId: CampaignId;
  sessionId: SessionId;
}): void {
  const { client, campaignId, sessionId } = args;

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
  }, [client, campaignId, sessionId]);
}
