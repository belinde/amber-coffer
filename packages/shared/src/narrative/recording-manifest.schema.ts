import { z } from 'zod';

import { discordUserIdSchema, sessionIdSchema } from '../ids/schemas.js';

import { audioSourceKindSchema } from './audio-source.schema.js';

/** Per-user continuous track (manifest v1, legacy). */
export const recordingManifestTrackSchema = z.object({
  discordUserId: discordUserIdSchema,
  displayName: z.string().min(1),
  relativePath: z.string().min(1),
  durationMs: z.number().int().nonnegative().nullable(),
  sampleRate: z.number().int().positive().nullable(),
  channels: z.number().int().positive().nullable(),
});

export type RecordingManifestTrack = z.infer<typeof recordingManifestTrackSchema>;

/** Time-bounded capture slice; paths are relative to the session directory. */
export const recordingManifestChunkSchema = z.object({
  discordUserId: discordUserIdSchema,
  displayName: z.string().min(1),
  relativePath: z.string().min(1),
  /** Milliseconds from session `startedAt` when this chunk began. */
  sessionOffsetMs: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  codec: z.literal('opus_ogg'),
  sampleRate: z.literal(48_000),
  channels: z.literal(2),
});

export type RecordingManifestChunk = z.infer<typeof recordingManifestChunkSchema>;

const recordingManifestBaseSchema = z.object({
  sessionId: sessionIdSchema,
  sourceKind: audioSourceKindSchema.default('discord_capture'),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative(),
  channelId: z.string().min(1),
});

/** Legacy: one concatenated file per participant. */
export const recordingManifestV1Schema = recordingManifestBaseSchema.extend({
  version: z.literal(1),
  tracks: z.array(recordingManifestTrackSchema),
});

export type RecordingManifestV1 = z.infer<typeof recordingManifestV1Schema>;

/** Chunked captures with session-relative timing (reconnect-safe). */
export const recordingManifestV2Schema = recordingManifestBaseSchema.extend({
  version: z.literal(2),
  chunks: z.array(recordingManifestChunkSchema),
});

export type RecordingManifestV2 = z.infer<typeof recordingManifestV2Schema>;

export const recordingManifestSchema = z.discriminatedUnion('version', [
  recordingManifestV1Schema,
  recordingManifestV2Schema,
]);

export type RecordingManifest = z.infer<typeof recordingManifestSchema>;
