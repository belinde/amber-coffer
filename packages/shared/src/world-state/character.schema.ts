import { z } from 'zod';

import { campaignIdSchema, characterIdSchema, locationIdSchema } from '../ids/schemas.js';

import { appearanceSchema, defaultAppearance } from './appearance.schema.js';
import { eventReferenceSchema } from './event-reference.schema.js';
import { gameStatsSchema } from './game-stats.schema.js';
import { imageRefSchema } from './image-ref.schema.js';
import { defaultVisibility, visibilitySchema } from './visibility.schema.js';

export const characterStatusSchema = z.enum(['active', 'retired', 'deceased']);

export const characterSchema = z.object({
  id: characterIdSchema,
  campaignId: campaignIdSchema,
  name: z.string().min(1),
  playerDiscordId: z.string().nullable(),
  currentLocationId: locationIdSchema.nullable(),
  species: z.string().nullable().default(null),
  roleHint: z.string().nullable().default(null),
  appearance: appearanceSchema.default(defaultAppearance),
  gameStats: gameStatsSchema,
  gameSystemHint: z.string().nullable().default(null),
  notableEquipment: z.array(z.string()).default([]),
  eventsInteresting: z.array(eventReferenceSchema).default([]),
  image: imageRefSchema.nullable().default(null),
  gmNotes: z.string().default(''),
  visibility: visibilitySchema.default(defaultVisibility),
  status: characterStatusSchema.default('active'),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type Character = z.infer<typeof characterSchema>;
