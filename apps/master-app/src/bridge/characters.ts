import { characterSchema, characterStatusSchema, type Character } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

import { parseBridgeInput } from './parse-bridge-input.js';
import { richCharacterFieldsSchema } from './vault-inputs.js';

type CampaignId = Character['campaignId'];
type CharacterId = Character['id'];

const createCharacterInputSchema = z
  .object({
    campaignId: z.string().min(1),
    name: z.string().min(1),
    playerDiscordId: z.string().nullable().optional(),
    currentLocationId: z.string().nullable().optional(),
    status: characterStatusSchema.default('active'),
  })
  .merge(richCharacterFieldsSchema);

const updateCharacterInputSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    playerDiscordId: z.string().nullable().optional(),
    currentLocationId: z.string().nullable().optional(),
    status: characterStatusSchema,
  })
  .merge(richCharacterFieldsSchema);

export type CreateCharacterInput = z.infer<typeof createCharacterInputSchema>;
export type UpdateCharacterInput = z.infer<typeof updateCharacterInputSchema>;

function parseCharacter(raw: unknown): Character {
  return characterSchema.parse(raw);
}

export async function listCharacters(campaignId: CampaignId): Promise<Character[]> {
  const raw = await invoke<unknown[]>('list_characters', { campaignId });
  return raw.map(parseCharacter);
}

export async function getCharacter(id: CharacterId): Promise<Character | null> {
  const raw: unknown = await invoke('get_character', { id });
  return raw === null ? null : parseCharacter(raw);
}

export async function createCharacter(input: CreateCharacterInput): Promise<Character> {
  const payload = parseBridgeInput(createCharacterInputSchema, input);
  const raw = await invoke<unknown>('create_character', { input: payload });
  return parseCharacter(raw);
}

export async function updateCharacter(input: UpdateCharacterInput): Promise<Character> {
  const payload = parseBridgeInput(updateCharacterInputSchema, input);
  const raw = await invoke<unknown>('update_character', { input: payload });
  return parseCharacter(raw);
}

export async function deleteCharacter(id: CharacterId): Promise<void> {
  return invoke<void>('delete_character', { id });
}

export { characterStatusSchema };
