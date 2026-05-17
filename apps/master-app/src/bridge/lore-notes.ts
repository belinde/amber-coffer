import { loreNoteSchema, type LoreNote } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

import { parseBridgeInput } from './parse-bridge-input.js';
import { loreNoteFieldsSchema } from './vault-inputs.js';

type CampaignId = LoreNote['campaignId'];
type LoreNoteId = LoreNote['id'];

const createLoreNoteInputSchema = z
  .object({
    campaignId: z.string().min(1),
    title: z.string().min(1),
  })
  .merge(loreNoteFieldsSchema);

const updateLoreNoteInputSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
  })
  .merge(loreNoteFieldsSchema);

export type CreateLoreNoteInput = z.infer<typeof createLoreNoteInputSchema>;
export type UpdateLoreNoteInput = z.infer<typeof updateLoreNoteInputSchema>;

function parse(raw: unknown): LoreNote {
  return loreNoteSchema.parse(raw);
}

export async function listLoreNotes(campaignId: CampaignId): Promise<LoreNote[]> {
  const raw = await invoke<unknown[]>('list_lore_notes', { campaignId });
  return raw.map(parse);
}

export async function getLoreNote(id: LoreNoteId): Promise<LoreNote | null> {
  const raw: unknown = await invoke('get_lore_note', { id });
  return raw === null ? null : parse(raw);
}

export async function createLoreNote(input: CreateLoreNoteInput): Promise<LoreNote> {
  const payload = parseBridgeInput(createLoreNoteInputSchema, input);
const raw = await invoke<unknown>('create_lore_note', { input: payload });
  return parse(raw);
}

export async function updateLoreNote(input: UpdateLoreNoteInput): Promise<LoreNote> {
  const payload = parseBridgeInput(updateLoreNoteInputSchema, input);
const raw = await invoke<unknown>('update_lore_note', { input: payload });
  return parse(raw);
}

export async function deleteLoreNote(id: LoreNoteId): Promise<void> {
  return invoke<void>('delete_lore_note', { id });
}
