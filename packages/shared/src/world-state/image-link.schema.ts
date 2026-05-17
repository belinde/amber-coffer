import { z } from 'zod';

import {
  characterIdSchema,
  locationIdSchema,
  npcIdSchema,
  sessionIdSchema,
} from '../ids/schemas.js';

export const imageLinkKindSchema = z.enum(['character', 'npc', 'location', 'session']);

export const imageLinkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('character'), id: characterIdSchema }),
  z.object({ kind: z.literal('npc'), id: npcIdSchema }),
  z.object({ kind: z.literal('location'), id: locationIdSchema }),
  z.object({ kind: z.literal('session'), id: sessionIdSchema }),
]);

export type ImageLink = z.infer<typeof imageLinkSchema>;
export type ImageLinkKind = z.infer<typeof imageLinkKindSchema>;
