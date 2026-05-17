import { z } from 'zod';

import { campaignIdSchema, loreNoteIdSchema } from '../ids/schemas.js';

import { entityRefSchema } from './entity-ref.schema.js';
import { defaultVisibility, visibilitySchema } from './visibility.schema.js';

export const loreNoteKindSchema = z.enum([
  'concept',
  'history',
  'culture',
  'economy',
  'religion',
  'cosmology',
  'custom',
]);

export const loreNoteSchema = z.object({
  id: loreNoteIdSchema,
  campaignId: campaignIdSchema,
  title: z.string().min(1),
  kind: loreNoteKindSchema.default('concept'),
  body: z.string().default(''),
  tags: z.array(z.string()).default([]),
  visibility: visibilitySchema.default(defaultVisibility),
  linkedEntities: z.array(entityRefSchema).default([]),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type LoreNote = z.infer<typeof loreNoteSchema>;
