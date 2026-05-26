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
  const raw = await invoke<unknown>('create_map', {
    input: { campaignId: payload.campaignId, name: payload.name ?? null },
  });
  return parseMap(raw);
}

const updateMapBackgroundInputSchema = z.object({
  mapId: z.string().min(1),
  sessionId: z.string().min(1),
  sessionToken: z.string().min(1),
  syncApiBaseUrl: z.string().min(1),
  campaignId: z.string().min(1),
  localPath: z.string().min(1).optional(),
  absoluteSourcePath: z.string().min(1).optional(),
  campaignImageId: z.string().min(1).optional(),
});

export type UpdateMapBackgroundInput = z.infer<typeof updateMapBackgroundInputSchema>;

export async function updateMapBackground(input: UpdateMapBackgroundInput): Promise<Map> {
  const payload = parseBridgeInput(updateMapBackgroundInputSchema, input);
  const raw = await invoke<unknown>('update_map_background', { input: payload });
  return parseMap(raw);
}

const updateMapGridColsInputSchema = z.object({
  mapId: z.string().min(1),
  campaignId: z.string().min(1),
  sessionId: z.string().min(1),
  gridCols: z.number().int().min(8).max(48),
});

export type UpdateMapGridColsInput = z.infer<typeof updateMapGridColsInputSchema>;

export async function updateMapGridCols(input: UpdateMapGridColsInput): Promise<Map> {
  const payload = parseBridgeInput(updateMapGridColsInputSchema, input);
  const raw = await invoke<unknown>('update_map_grid_cols', { input: payload });
  return parseMap(raw);
}
