import {
  entityOwnerKindSchema,
  itemKindSchema,
  itemRaritySchema,
  itemSchema,
  type Item,
} from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

import { parseBridgeInput } from './parse-bridge-input.js';

type CampaignId = Item['campaignId'];
type ItemId = Item['id'];

const createItemInputSchema = z.object({
  campaignId: z.string().min(1),
  name: z.string().min(1),
  kind: itemKindSchema.nullable().optional(),
  rarity: itemRaritySchema.nullable().optional(),
  description: z.string().nullable().optional(),
  ownerKind: entityOwnerKindSchema.nullable().optional(),
  ownerId: z.string().nullable().optional(),
});

const updateItemInputSchema = createItemInputSchema
  .omit({ campaignId: true })
  .extend({ id: z.string().min(1) });

export type CreateItemInput = z.infer<typeof createItemInputSchema>;
export type UpdateItemInput = z.infer<typeof updateItemInputSchema>;

export { entityOwnerKindSchema, itemKindSchema, itemRaritySchema };

function parse(raw: unknown): Item {
  return itemSchema.parse(raw);
}

export async function listItems(campaignId: CampaignId): Promise<Item[]> {
  const raw = await invoke<unknown[]>('list_items', { campaignId });
  return raw.map(parse);
}

export async function getItem(id: ItemId): Promise<Item | null> {
  const raw: unknown = await invoke('get_item', { id });
  return raw === null ? null : parse(raw);
}

export async function createItem(input: CreateItemInput): Promise<Item> {
  const payload = parseBridgeInput(createItemInputSchema, input);
const raw = await invoke<unknown>('create_item', { input: payload });
  return parse(raw);
}

export async function updateItem(input: UpdateItemInput): Promise<Item> {
  const payload = parseBridgeInput(updateItemInputSchema, input);
const raw = await invoke<unknown>('update_item', { input: payload });
  return parse(raw);
}

export async function deleteItem(id: ItemId): Promise<void> {
  return invoke<void>('delete_item', { id });
}
