import { z } from 'zod';

import { campaignIdSchema, locationIdSchema, npcIdSchema, sessionIdSchema } from '../ids/schemas.js';

export const sessionStatusSchema = z.enum([
  'planned',
  'recording',
  'recorded',
  'transcribing',
  'transcribed',
  'refining',
  'refined',
  'validating',
  'published',
]);

export const sessionSchema = z.object({
  id: sessionIdSchema,
  campaignId: campaignIdSchema,
  number: z.number().int().positive(),
  title: z.string().nullable(),
  status: sessionStatusSchema.default('planned'),
  startedAt: z.number().int().nonnegative().nullable(),
  endedAt: z.number().int().nonnegative().nullable(),
  summary: z.string().default(''),
  eventsBody: z.string().default(''),
  gmNotes: z.string().default(''),
  publicSummary: z.string().nullable().default(null),
  locationsVisited: z.array(locationIdSchema).default([]),
  npcsEncountered: z.array(npcIdSchema).default([]),
  playedAt: z.number().int().nonnegative().nullable().default(null),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type Session = z.infer<typeof sessionSchema>;
