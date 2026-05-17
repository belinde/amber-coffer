import { mapSchema, type Map } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

import { parseBridgeInput } from './parse-bridge-input.js';

type CampaignId = Map['campaignId'];

const createMapInputSchema = z.object({
  campaignId: z.string().min(1),
  name: z.string().min(1).optional(),
});

export type CreateMapInput = z.infer<typeof createMapInputSchema>;

function parseMap(raw: unknown): Map {
  return mapSchema.parse(raw);
}

export async function listMaps(campaignId: CampaignId): Promise<Map[]> {
  const raw = await invoke<unknown[]>('list_maps', { campaignId });
  return raw.map(parseMap);
}

export async function createMap(input: CreateMapInput): Promise<Map> {
  const payload = parseBridgeInput(createMapInputSchema, input);
  const raw = await invoke<unknown>('create_map', { input: { campaignId: payload.campaignId, name: payload.name ?? null } });
  return parseMap(raw);
}
