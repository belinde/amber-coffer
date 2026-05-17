import {
  appearanceSchema,
  defaultAppearance,
  defaultVisibility,
  entityRefSchema,
  eventReferenceSchema,
  gameStatsSchema,
  imageRefSchema,
  linkToCharacterSchema,
  locationSectionSchema,
  visibilitySchema,
} from '@amber/shared';
import { z } from 'zod';

export const appearanceInputSchema = appearanceSchema.default(defaultAppearance);
export const visibilityInputSchema = visibilitySchema.default(defaultVisibility);

export const richCharacterFieldsSchema = z.object({
  species: z.string().nullable().optional(),
  roleHint: z.string().nullable().optional(),
  appearance: appearanceInputSchema,
  gameStats: gameStatsSchema,
  gameSystemHint: z.string().nullable().optional(),
  notableEquipment: z.array(z.string()).default([]),
  eventsInteresting: z.array(eventReferenceSchema).default([]),
  image: imageRefSchema.nullable().optional(),
  gmNotes: z.string().default(''),
  visibility: visibilityInputSchema,
});

export const richNpcFieldsSchema = richCharacterFieldsSchema.extend({
  region: z.string().nullable().optional(),
  scope: z.string().nullable().optional(),
  reminder: z.string().nullable().optional(),
  recordKind: z.enum(['canonical', 'scratch']).default('canonical'),
  linksToCharacters: z.array(linkToCharacterSchema).default([]),
});

export const richLocationFieldsSchema = z.object({
  region: z.string().nullable().optional(),
  kind: z.string().nullable().optional(),
  population: z.string().nullable().optional(),
  appearance: appearanceInputSchema,
  sections: z.array(locationSectionSchema).default([]),
  eventsInteresting: z.array(eventReferenceSchema).default([]),
  image: imageRefSchema.nullable().optional(),
  visibility: visibilityInputSchema,
});

export const richFactionFieldsSchema = z.object({
  kind: z
    .enum(['state', 'kingdom', 'company', 'guild', 'cult', 'family', 'other'])
    .nullable()
    .optional(),
  parentFactionId: z.string().nullable().optional(),
  goals: z.string().default(''),
  secrets: z.string().default(''),
  eventsInteresting: z.array(eventReferenceSchema).default([]),
  image: imageRefSchema.nullable().optional(),
  visibility: visibilityInputSchema,
});

export const loreNoteFieldsSchema = z.object({
  kind: z
    .enum([
      'concept',
      'history',
      'culture',
      'economy',
      'religion',
      'cosmology',
      'custom',
    ])
    .default('concept'),
  body: z.string().default(''),
  tags: z.array(z.string()).default([]),
  visibility: visibilityInputSchema,
  linkedEntities: z.array(entityRefSchema).default([]),
});

export const narrativeSeedFieldsSchema = z.object({
  summary: z.string().default(''),
  status: z
    .enum(['idea', 'planned', 'introduced', 'closed', 'discarded'])
    .default('idea'),
  body: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  linkedEntities: z.array(entityRefSchema).default([]),
  firstSessionId: z.string().nullable().optional(),
});
