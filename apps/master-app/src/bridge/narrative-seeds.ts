import { narrativeSeedSchema, narrativeSeedStatusSchema, type NarrativeSeed } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

import { parseBridgeInput } from './parse-bridge-input.js';
import { narrativeSeedFieldsSchema } from './vault-inputs.js';

type CampaignId = NarrativeSeed['campaignId'];
type NarrativeSeedId = NarrativeSeed['id'];

const createNarrativeSeedInputSchema = z
  .object({
    campaignId: z.string().min(1),
    title: z.string().min(1),
  })
  .merge(narrativeSeedFieldsSchema);

const updateNarrativeSeedInputSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
  })
  .merge(narrativeSeedFieldsSchema);

export type CreateNarrativeSeedInput = z.infer<typeof createNarrativeSeedInputSchema>;
export type UpdateNarrativeSeedInput = z.infer<typeof updateNarrativeSeedInputSchema>;

export { narrativeSeedStatusSchema };

function parse(raw: unknown): NarrativeSeed {
  return narrativeSeedSchema.parse(raw);
}

export async function listNarrativeSeeds(campaignId: CampaignId): Promise<NarrativeSeed[]> {
  const raw = await invoke<unknown[]>('list_narrative_seeds', { campaignId });
  return raw.map(parse);
}

export async function getNarrativeSeed(id: NarrativeSeedId): Promise<NarrativeSeed | null> {
  const raw: unknown = await invoke('get_narrative_seed', { id });
  return raw === null ? null : parse(raw);
}

export async function createNarrativeSeed(
  input: CreateNarrativeSeedInput,
): Promise<NarrativeSeed> {
  const payload = parseBridgeInput(createNarrativeSeedInputSchema, input);
const raw = await invoke<unknown>('create_narrative_seed', { input: payload });
  return parse(raw);
}

export async function updateNarrativeSeed(
  input: UpdateNarrativeSeedInput,
): Promise<NarrativeSeed> {
  const payload = parseBridgeInput(updateNarrativeSeedInputSchema, input);
const raw = await invoke<unknown>('update_narrative_seed', { input: payload });
  return parse(raw);
}

export async function deleteNarrativeSeed(id: NarrativeSeedId): Promise<void> {
  return invoke<void>('delete_narrative_seed', { id });
}
