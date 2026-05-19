import { z } from 'zod';

import { DEFAULT_PLAY_LANGUAGE, playLanguageSchema } from '../i18n/play-language.js';
import { campaignIdSchema, discordChannelIdSchema, discordGuildIdSchema } from '../ids/schemas.js';

export const campaignSchema = z.object({
  id: campaignIdSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable(),
  /** Short tagline shown in campaign branding (distinct from long-form description). */
  catchphrase: z.string().nullable().default(null),
  /** Language the table plays in (bot VC announcements, transcription hint). */
  playLanguage: playLanguageSchema.default(DEFAULT_PLAY_LANGUAGE),
  discordChannelId: discordChannelIdSchema.nullable(),
  discordGuildId: discordGuildIdSchema.nullable().default(null),
  /** Display label captured when linking Discord (Developer Portal names). */
  discordGuildName: z.string().min(1).nullable().default(null),
  discordChannelName: z.string().min(1).nullable().default(null),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type Campaign = z.infer<typeof campaignSchema>;
