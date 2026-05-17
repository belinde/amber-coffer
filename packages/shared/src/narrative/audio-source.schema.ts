import { z } from 'zod';

import { discordUserIdSchema } from '../ids/schemas.js';

/** Known audio source kinds; arbitrary strings allowed for forward compatibility (ADR 0004). */
export const audioSourceKindSchema = z.union([
  z.enum(['gm_mic', 'system_monitor', 'upload', 'discord_capture']),
  z.string().min(1),
]);

export type AudioSourceKind = z.infer<typeof audioSourceKindSchema>;

export const audioSourceSchema = z.object({
  id: z.string().min(1),
  kind: audioSourceKindSchema,
  label: z.string().min(1),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative().nullable(),
  /** Path relative to campaign root (never absolute). */
  path: z.string().min(1),
  discordUserId: discordUserIdSchema.optional(),
  clockOffsetMs: z.number().int().optional(),
  metadata: z.record(z.unknown()).optional(),
  diarize: z.boolean().optional(),
});

export type AudioSource = z.infer<typeof audioSourceSchema>;
