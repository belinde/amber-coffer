import { locationSchema, type Location } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

import { parseBridgeInput } from './parse-bridge-input.js';
import { richLocationFieldsSchema } from './vault-inputs.js';

type CampaignId = Location['campaignId'];
type LocationId = Location['id'];

const createLocationInputSchema = z
  .object({
    campaignId: z.string().min(1),
    parentId: z.string().nullable().optional(),
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    coordinates: z.record(z.unknown()).nullable().optional(),
  })
  .merge(richLocationFieldsSchema);

const updateLocationInputSchema = createLocationInputSchema
  .omit({ campaignId: true })
  .extend({ id: z.string().min(1) });

export type CreateLocationInput = z.infer<typeof createLocationInputSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationInputSchema>;

function parse(raw: unknown): Location {
  return locationSchema.parse(raw);
}

export async function listLocations(campaignId: CampaignId): Promise<Location[]> {
  const raw = await invoke<unknown[]>('list_locations', { campaignId });
  return raw.map(parse);
}

export async function getLocation(id: LocationId): Promise<Location | null> {
  const raw: unknown = await invoke('get_location', { id });
  return raw === null ? null : parse(raw);
}

export async function createLocation(input: CreateLocationInput): Promise<Location> {
  const payload = parseBridgeInput(createLocationInputSchema, input);
const raw = await invoke<unknown>('create_location', { input: payload });
  return parse(raw);
}

export async function updateLocation(input: UpdateLocationInput): Promise<Location> {
  const payload = parseBridgeInput(updateLocationInputSchema, input);
const raw = await invoke<unknown>('update_location', { input: payload });
  return parse(raw);
}

export async function deleteLocation(id: LocationId): Promise<void> {
  return invoke<void>('delete_location', { id });
}
