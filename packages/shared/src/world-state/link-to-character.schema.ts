import { z } from 'zod';

import { characterIdSchema } from '../ids/schemas.js';

export const linkToCharacterSchema = z.object({
  characterId: characterIdSchema,
  description: z.string().default(''),
});

export const linksToCharactersSchema = z.array(linkToCharacterSchema).default([]);

export type LinkToCharacter = z.infer<typeof linkToCharacterSchema>;
