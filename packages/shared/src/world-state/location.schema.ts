import { z } from 'zod';

import { campaignIdSchema, locationIdSchema } from '../ids/schemas.js';

import { appearanceSchema, defaultAppearance } from './appearance.schema.js';
import { eventReferenceSchema } from './event-reference.schema.js';
import { imageRefSchema } from './image-ref.schema.js';
import { locationSectionsSchema } from './location-section.schema.js';
import { defaultVisibility, visibilitySchema } from './visibility.schema.js';

export const locationSchema = z.object({
  id: locationIdSchema,
  campaignId: campaignIdSchema,
  parentId: locationIdSchema.nullable(),
  name: z.string().min(1),
  region: z.string().nullable().default(null),
  kind: z.string().nullable().default(null),
  population: z.string().nullable().default(null),
  appearance: appearanceSchema.default(defaultAppearance),
  sections: locationSectionsSchema,
  eventsInteresting: z.array(eventReferenceSchema).default([]),
  image: imageRefSchema.nullable().default(null),
  visibility: visibilitySchema.default(defaultVisibility),
  description: z.string().nullable(),
  coordinates: z.record(z.unknown()).nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type Location = z.infer<typeof locationSchema>;
