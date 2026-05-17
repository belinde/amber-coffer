import { factionKindSchema, factionSchema, type Faction } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

import { parseBridgeInput } from './parse-bridge-input.js';
import { richFactionFieldsSchema } from './vault-inputs.js';

type CampaignId = Faction['campaignId'];
type FactionId = Faction['id'];

const createFactionInputSchema = z
  .object({
    campaignId: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    headquartersLocationId: z.string().nullable().optional(),
  })
  .merge(richFactionFieldsSchema);

const updateFactionInputSchema = createFactionInputSchema
  .omit({ campaignId: true })
  .extend({ id: z.string().min(1) });

export type CreateFactionInput = z.infer<typeof createFactionInputSchema>;
export type UpdateFactionInput = z.infer<typeof updateFactionInputSchema>;

export { factionKindSchema };

function parse(raw: unknown): Faction {
  return factionSchema.parse(raw);
}

export async function listFactions(campaignId: CampaignId): Promise<Faction[]> {
  const raw = await invoke<unknown[]>('list_factions', { campaignId });
  return raw.map(parse);
}

export async function getFaction(id: FactionId): Promise<Faction | null> {
  const raw: unknown = await invoke('get_faction', { id });
  return raw === null ? null : parse(raw);
}

export async function createFaction(input: CreateFactionInput): Promise<Faction> {
  const payload = parseBridgeInput(createFactionInputSchema, input);
const raw = await invoke<unknown>('create_faction', { input: payload });
  return parse(raw);
}

export async function updateFaction(input: UpdateFactionInput): Promise<Faction> {
  const payload = parseBridgeInput(updateFactionInputSchema, input);
const raw = await invoke<unknown>('update_faction', { input: payload });
  return parse(raw);
}

export async function deleteFaction(id: FactionId): Promise<void> {
  return invoke<void>('delete_faction', { id });
}
