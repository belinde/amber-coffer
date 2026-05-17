import { z } from 'zod';

import { campaignIdSchema, itemIdSchema } from '../ids/schemas.js';
import { entityOwnerKindSchema } from '../ids/schemas.js';

export const itemKindSchema = z.enum([
  'weapon',
  'armor',
  'consumable',
  'key',
  'artifact',
  'misc',
]);

export const itemRaritySchema = z.enum([
  'common',
  'uncommon',
  'rare',
  'legendary',
  'unique',
]);

export const itemSchema = z.object({
  id: itemIdSchema,
  campaignId: campaignIdSchema,
  name: z.string().min(1),
  kind: itemKindSchema.nullable(),
  rarity: itemRaritySchema.nullable(),
  description: z.string().nullable(),
  ownerKind: entityOwnerKindSchema.nullable(),
  ownerId: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type Item = z.infer<typeof itemSchema>;
