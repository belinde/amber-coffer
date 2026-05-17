import {
  npcDispositionSchema,
  npcRecordKindSchema,
  npcSchema,
  npcStatusSchema,
  type Npc,
} from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

import { parseBridgeInput } from './parse-bridge-input.js';
import { richNpcFieldsSchema } from './vault-inputs.js';

type CampaignId = Npc['campaignId'];
type NpcId = Npc['id'];

const createNpcInputSchema = z
  .object({
    campaignId: z.string().min(1),
    name: z.string().min(1),
    currentLocationId: z.string().nullable().optional(),
    factionId: z.string().nullable().optional(),
    status: npcStatusSchema.default('alive'),
    disposition: npcDispositionSchema.nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .merge(richNpcFieldsSchema);

const updateNpcInputSchema = createNpcInputSchema
  .omit({ campaignId: true })
  .extend({ id: z.string().min(1) });

export type CreateNpcInput = z.infer<typeof createNpcInputSchema>;
export type UpdateNpcInput = z.infer<typeof updateNpcInputSchema>;

export { npcDispositionSchema, npcRecordKindSchema, npcStatusSchema };

function parse(raw: unknown): Npc {
  return npcSchema.parse(raw);
}

export async function listNpcs(campaignId: CampaignId): Promise<Npc[]> {
  const raw = await invoke<unknown[]>('list_npcs', { campaignId });
  return raw.map(parse);
}

export async function getNpc(id: NpcId): Promise<Npc | null> {
  const raw: unknown = await invoke('get_npc', { id });
  return raw === null ? null : parse(raw);
}

export async function createNpc(input: CreateNpcInput): Promise<Npc> {
  const payload = parseBridgeInput(createNpcInputSchema, input);
  const raw = await invoke<unknown>('create_npc', { input: payload });
  return parse(raw);
}

export async function updateNpc(input: UpdateNpcInput): Promise<Npc> {
  const payload = parseBridgeInput(updateNpcInputSchema, input);
  const raw = await invoke<unknown>('update_npc', { input: payload });
  return parse(raw);
}

export async function deleteNpc(id: NpcId): Promise<void> {
  return invoke<void>('delete_npc', { id });
}
