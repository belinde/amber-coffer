import { z } from 'zod';

import {
  campaignIdSchema,
  factionIdSchema,
  locationIdSchema,
  npcIdSchema,
} from '../ids/schemas.js';

import { appearanceSchema, defaultAppearance } from './appearance.schema.js';
import { eventReferenceSchema } from './event-reference.schema.js';
import { gameStatsSchema } from './game-stats.schema.js';
import { imageRefSchema } from './image-ref.schema.js';
import { linksToCharactersSchema } from './link-to-character.schema.js';
import { defaultVisibility, visibilitySchema } from './visibility.schema.js';

export const npcStatusSchema = z.enum(['alive', 'dead', 'missing', 'unknown']);
export const npcDispositionSchema = z.enum([
  'friendly',
  'neutral',
  'hostile',
  'unknown',
]);
export const npcRecordKindSchema = z.enum(['canonical', 'scratch']);

export const npcSchema = z.object({
  id: npcIdSchema,
  campaignId: campaignIdSchema,
  name: z.string().min(1),
  currentLocationId: locationIdSchema.nullable(),
  factionId: factionIdSchema.nullable(),
  species: z.string().nullable().default(null),
  roleHint: z.string().nullable().default(null),
  region: z.string().nullable().default(null),
  scope: z.string().nullable().default(null),
  reminder: z.string().nullable().default(null),
  recordKind: npcRecordKindSchema.default('canonical'),
  appearance: appearanceSchema.default(defaultAppearance),
  gameStats: gameStatsSchema,
  gameSystemHint: z.string().nullable().default(null),
  notableEquipment: z.array(z.string()).default([]),
  linksToCharacters: linksToCharactersSchema,
  eventsInteresting: z.array(eventReferenceSchema).default([]),
  image: imageRefSchema.nullable().default(null),
  gmNotes: z.string().default(''),
  visibility: visibilitySchema.default(defaultVisibility),
  status: npcStatusSchema.default('alive'),
  disposition: npcDispositionSchema.nullable(),
  description: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type Npc = z.infer<typeof npcSchema>;
