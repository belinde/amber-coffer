import { z } from 'zod';

import { discordUserIdSchema, recordingIdSchema, sessionIdSchema } from '../ids/schemas.js';
import { audioSourceKindSchema } from './audio-source.schema.js';

export const recordingSchema = z.object({
  id: recordingIdSchema,
  sessionId: sessionIdSchema,
  userDiscordId: discordUserIdSchema,
  sourceKind: audioSourceKindSchema.default('discord_capture'),
  filePath: z.string().min(1),
  durationMs: z.number().int().nonnegative().nullable(),
  sampleRate: z.number().int().positive().nullable(),
  channels: z.number().int().positive().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type Recording = z.infer<typeof recordingSchema>;
