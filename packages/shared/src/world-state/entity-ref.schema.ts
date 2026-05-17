import { z } from 'zod';

import {
  characterIdSchema,
  factionIdSchema,
  locationIdSchema,
  loreNoteIdSchema,
  narrativeSeedIdSchema,
  npcIdSchema,
} from '../ids/schemas.js';

export const entityRefKindSchema = z.enum([
  'character',
  'npc',
  'location',
  'faction',
  'lore_note',
  'narrative_seed',
]);

export const entityRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('character'), id: characterIdSchema }),
  z.object({ kind: z.literal('npc'), id: npcIdSchema }),
  z.object({ kind: z.literal('location'), id: locationIdSchema }),
  z.object({ kind: z.literal('faction'), id: factionIdSchema }),
  z.object({ kind: z.literal('lore_note'), id: loreNoteIdSchema }),
  z.object({ kind: z.literal('narrative_seed'), id: narrativeSeedIdSchema }),
]);

export type EntityRef = z.infer<typeof entityRefSchema>;
export type EntityRefKind = z.infer<typeof entityRefKindSchema>;
