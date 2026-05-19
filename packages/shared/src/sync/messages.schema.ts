import { z } from 'zod';

import {
  campaignIdSchema,
  discordChannelIdSchema,
  entityKindSchema,
  fogRegionIdSchema,
  handoutIdSchema,
  mapIdSchema,
  sessionIdSchema,
  tokenIdSchema,
} from '../ids/schemas.js';
import { handoutSchema } from '../world-state/handout.schema.js';
import { mapSchema } from '../world-state/map.schema.js';
import { tokenPositionSchema, tokenSchema } from '../world-state/token.schema.js';

const tokenMovedSchema = z.object({
  kind: z.literal('token.moved'),
  tokenId: tokenIdSchema,
  mapId: mapIdSchema,
  position: tokenPositionSchema,
});

const tokenMoveRequestSchema = z.object({
  kind: z.literal('token.move.request'),
  tokenId: tokenIdSchema,
  mapId: mapIdSchema,
  requestedPosition: tokenPositionSchema,
});

const tokenCreatedSchema = z.object({
  kind: z.literal('token.created'),
  token: tokenSchema,
});

const tokenRemovedSchema = z.object({
  kind: z.literal('token.removed'),
  tokenId: tokenIdSchema,
});

const fogRevealedSchema = z.object({
  kind: z.literal('fog.revealed'),
  regionId: fogRegionIdSchema,
  mapId: mapIdSchema,
});

const fogHiddenSchema = z.object({
  kind: z.literal('fog.hidden'),
  regionId: fogRegionIdSchema,
  mapId: mapIdSchema,
});

const mapActivatedSchema = z.object({
  kind: z.literal('map.activated'),
  mapId: mapIdSchema,
});

const mapUpdatedSchema = z.object({
  kind: z.literal('map.updated'),
  map: mapSchema,
});

const entityUpdatedSchema = z.object({
  kind: z.literal('entity.updated'),
  entityKind: entityKindSchema,
  entityId: z.string().min(1),
  version: z.number().int().positive(),
});

const handoutShownSchema = z.object({
  kind: z.literal('handout.shown'),
  handout: handoutSchema,
});

const handoutHiddenSchema = z.object({
  kind: z.literal('handout.hidden'),
  handoutId: handoutIdSchema,
});

const sessionHandshakeSchema = z.object({
  kind: z.literal('session.handshake'),
  channelId: discordChannelIdSchema,
  campaignId: campaignIdSchema,
});

const sessionHeartbeatSchema = z.object({
  kind: z.literal('session.heartbeat'),
  uptime: z.number().nonnegative(),
});

const sessionEndedSchema = z.object({
  kind: z.literal('session.ended'),
  sessionId: sessionIdSchema,
  reason: z.string().optional(),
});

/**
 * Full state snapshot published as a **retained** MQTT message on
 * `amber-coffer/{campaignId}/{sessionId}/snapshot` so newly joined
 * Player Activities can bootstrap without a back-channel.
 *
 * Decision recorded in docs/migration/tabletop-porting-notes.md (D6).
 */
export const tabletopSnapshotSchema = z.object({
  kind: z.literal('tabletop.snapshot'),
  sessionId: sessionIdSchema,
  activeMapId: mapIdSchema.nullable(),
  maps: z.array(mapSchema),
  tokens: z.array(tokenSchema),
  visibleHandouts: z.array(handoutSchema),
  snapshotAt: z.number().int().nonnegative(),
});

export const mqttMessageSchema = z.discriminatedUnion('kind', [
  tokenMovedSchema,
  tokenMoveRequestSchema,
  tokenCreatedSchema,
  tokenRemovedSchema,
  fogRevealedSchema,
  fogHiddenSchema,
  mapActivatedSchema,
  mapUpdatedSchema,
  entityUpdatedSchema,
  handoutShownSchema,
  handoutHiddenSchema,
  sessionHandshakeSchema,
  sessionHeartbeatSchema,
  sessionEndedSchema,
  tabletopSnapshotSchema,
]);

export type MqttMessage = z.infer<typeof mqttMessageSchema>;
