import type { CampaignId, DiscordUserId, MqttMessage, SessionId, Token } from '@amber/shared';

import { HttpPollSyncClient } from '../../sync/http-poll-sync-client.js';
import type { SyncClientLike } from '../../sync/types.js';

export async function publishTokenMoved(args: {
  client: SyncClientLike;
  campaignId: CampaignId;
  sessionId: SessionId;
  playerDiscordId: DiscordUserId;
  token: Token;
  position: Token['position'];
}): Promise<void> {
  const payload: MqttMessage = {
    kind: 'token.move.request',
    tokenId: args.token.id,
    mapId: args.token.mapId,
    requestedPosition: args.position,
  };

  if (args.client instanceof HttpPollSyncClient) {
    await args.client.postEvents([payload], { useDiscordProxy: true });
    return;
  }

  // In-memory dev stub: echo as accepted move for local testing.
  const accepted: MqttMessage = {
    kind: 'token.moved',
    tokenId: args.token.id,
    mapId: args.token.mapId,
    position: args.position,
  };
  const topic = args.client.buildTopic(args.campaignId, args.sessionId, 'tokens');
  args.client.publish(
    topic,
    JSON.stringify({
      v: 1,
      campaignId: args.campaignId,
      sessionId: args.sessionId,
      senderRole: 'player',
      senderId: args.playerDiscordId,
      seq: 0,
      timestamp: Date.now(),
      payload: accepted,
    }),
  );
}
