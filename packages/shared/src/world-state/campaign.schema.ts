import { z } from 'zod';

import { campaignIdSchema, discordChannelIdSchema } from '../ids/schemas.js';

export const campaignSchema = z.object({
  id: campaignIdSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable(),
  discordChannelId: discordChannelIdSchema.nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type Campaign = z.infer<typeof campaignSchema>;
