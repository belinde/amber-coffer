import { z } from 'zod';

import { campaignIdSchema, narrativeSeedIdSchema, sessionIdSchema } from '../ids/schemas.js';

import { entityRefSchema } from './entity-ref.schema.js';

export const narrativeSeedStatusSchema = z.enum([
  'idea',
  'planned',
  'introduced',
  'closed',
  'discarded',
]);

export const narrativeSeedSchema = z.object({
  id: narrativeSeedIdSchema,
  campaignId: campaignIdSchema,
  title: z.string().min(1),
  summary: z.string().default(''),
  status: narrativeSeedStatusSchema.default('idea'),
  body: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  linkedEntities: z.array(entityRefSchema).default([]),
  firstSessionId: sessionIdSchema.nullable().default(null),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type NarrativeSeed = z.infer<typeof narrativeSeedSchema>;
