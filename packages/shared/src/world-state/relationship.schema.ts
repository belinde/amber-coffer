import { z } from 'zod';

import { campaignIdSchema, entityKindSchema, relationshipIdSchema } from '../ids/schemas.js';

export const relationTypeSchema = z.enum([
  'ally',
  'enemy',
  'family',
  'owns',
  'located_in',
  'member_of',
  'knows',
  'other',
]);

export const relationshipSchema = z.object({
  id: relationshipIdSchema,
  campaignId: campaignIdSchema,
  fromKind: entityKindSchema,
  fromId: z.string().min(1),
  toKind: entityKindSchema,
  toId: z.string().min(1),
  relationType: relationTypeSchema,
  strength: z.number().int().min(-100).max(100).default(0),
  bidirectional: z.boolean().default(false),
  description: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type Relationship = z.infer<typeof relationshipSchema>;
