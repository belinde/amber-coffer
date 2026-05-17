import { z } from 'zod';

import { campaignIdSchema, factionIdSchema, locationIdSchema } from '../ids/schemas.js';

import { eventReferenceSchema } from './event-reference.schema.js';
import { imageRefSchema } from './image-ref.schema.js';
import { defaultVisibility, visibilitySchema } from './visibility.schema.js';

export const factionKindSchema = z.enum([
  'state',
  'kingdom',
  'company',
  'guild',
  'cult',
  'family',
  'other',
]);

export const factionSchema = z.object({
  id: factionIdSchema,
  campaignId: campaignIdSchema,
  name: z.string().min(1),
  kind: factionKindSchema.nullable().default(null),
  parentFactionId: factionIdSchema.nullable().default(null),
  headquartersLocationId: locationIdSchema.nullable(),
  goals: z.string().default(''),
  secrets: z.string().default(''),
  description: z.string().nullable(),
  eventsInteresting: z.array(eventReferenceSchema).default([]),
  image: imageRefSchema.nullable().default(null),
  visibility: visibilitySchema.default(defaultVisibility),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type Faction = z.infer<typeof factionSchema>;
