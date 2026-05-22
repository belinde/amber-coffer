import { z } from 'zod';

import {
  campaignIdSchema,
  discordChannelIdSchema,
  discordUserIdSchema,
  sessionIdSchema,
} from '../ids/schemas.js';

import { DEFAULT_SESSION_POLL_INTERVAL_MS } from './session-sync.schema.js';

/** POST /session/handshake — Discord Activity bootstrap. */
export const sessionHandshakeRequestSchema = z.object({
  /** OAuth2 authorization code from Discord Embedded App SDK `authorize()`. */
  code: z.string().min(1),
  channelId: discordChannelIdSchema,
  /** Must match the redirect URI used in the Activity (Embedded App URL). */
  redirectUri: z.string().url(),
});

export type SessionHandshakeRequest = z.infer<typeof sessionHandshakeRequestSchema>;

export const sessionHandshakeSyncSchema = z.object({
  sessionToken: z.string().min(1),
  pollIntervalMs: z.number().int().positive().default(DEFAULT_SESSION_POLL_INTERVAL_MS),
});

export const sessionHandshakeResponseSchema = z.object({
  campaignId: campaignIdSchema,
  sessionId: sessionIdSchema,
  playerDiscordId: discordUserIdSchema,
  sync: sessionHandshakeSyncSchema,
});

export type SessionHandshakeResponse = z.infer<typeof sessionHandshakeResponseSchema>;

export const sessionHandshakeErrorSchema = z.object({
  error: z.string().min(1),
  message: z.string().optional(),
});

export type SessionHandshakeError = z.infer<typeof sessionHandshakeErrorSchema>;

/** PUT /session/handshake/channel — master registers the live session for a voice channel. */
export const sessionHandshakeChannelLinkRequestSchema = z.object({
  channelId: discordChannelIdSchema,
});

export type SessionHandshakeChannelLinkRequest = z.infer<
  typeof sessionHandshakeChannelLinkRequestSchema
>;

export const sessionHandshakeChannelLinkResponseSchema = z.object({
  campaignId: campaignIdSchema,
  sessionId: sessionIdSchema,
  channelId: discordChannelIdSchema,
});

export type SessionHandshakeChannelLinkResponse = z.infer<
  typeof sessionHandshakeChannelLinkResponseSchema
>;
