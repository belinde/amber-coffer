import { z } from 'zod';

import { campaignIdSchema, discordChannelIdSchema, sessionIdSchema } from '../ids/schemas.js';

import { mqttMessageSchema, tabletopSnapshotSchema } from './messages.schema.js';

/** Default poll interval returned by handshake (ms). */
export const DEFAULT_SESSION_POLL_INTERVAL_MS = 2000;

/** GET /session/sync/state */
export const sessionSyncStateResponseSchema = z.object({
  version: z.number().int().nonnegative(),
  snapshot: tabletopSnapshotSchema.nullable(),
  sessionEnded: z.boolean(),
  pendingEvents: z.array(mqttMessageSchema),
});

export type SessionSyncStateResponse = z.infer<typeof sessionSyncStateResponseSchema>;

/** PUT /session/sync/snapshot */
export const sessionSyncSnapshotPutSchema = z.object({
  campaignId: campaignIdSchema,
  sessionId: sessionIdSchema,
  snapshot: tabletopSnapshotSchema,
});

export type SessionSyncSnapshotPut = z.infer<typeof sessionSyncSnapshotPutSchema>;

/** POST /session/sync/events */
export const sessionSyncEventsPostSchema = z.object({
  events: z.array(mqttMessageSchema).min(1).max(32),
});

export type SessionSyncEventsPost = z.infer<typeof sessionSyncEventsPostSchema>;

/** POST /session/master/token */
export const sessionMasterTokenRequestSchema = z.object({
  campaignId: campaignIdSchema,
  sessionId: sessionIdSchema,
  /** Discord OAuth access token from master-app user session. */
  discordAccessToken: z.string().min(1),
  /** When set, maps this voice channel to the live session for Player Activity handshake. */
  channelId: discordChannelIdSchema.optional(),
});

export type SessionMasterTokenRequest = z.infer<typeof sessionMasterTokenRequestSchema>;

export const sessionMasterTokenResponseSchema = z.object({
  sessionToken: z.string().min(1),
  pollIntervalMs: z.number().int().positive(),
  campaignId: campaignIdSchema,
  sessionId: sessionIdSchema,
  handshakeChannelLinked: z.boolean().optional(),
});

export type SessionMasterTokenResponse = z.infer<typeof sessionMasterTokenResponseSchema>;

export const sessionSyncApiErrorSchema = z.object({
  error: z.string().min(1),
  message: z.string().optional(),
});

export type SessionSyncApiError = z.infer<typeof sessionSyncApiErrorSchema>;
