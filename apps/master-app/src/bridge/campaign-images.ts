import { campaignImageSchema, type CampaignImage } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

import { parseBridgeInput } from './parse-bridge-input.js';
import { visibilityInputSchema } from './vault-inputs.js';

type CampaignId = CampaignImage['campaignId'];
type CampaignImageId = CampaignImage['id'];

const imageLinkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('character'), id: z.string().min(1) }),
  z.object({ kind: z.literal('npc'), id: z.string().min(1) }),
  z.object({ kind: z.literal('location'), id: z.string().min(1) }),
  z.object({ kind: z.literal('session'), id: z.string().min(1) }),
]);

const createCampaignImageInputSchema = z.object({
  campaignId: z.string().min(1),
  title: z.string().min(1),
  caption: z.string().default(''),
  visibility: visibilityInputSchema,
  links: z.array(imageLinkSchema).default([]),
});

const updateCampaignImageInputSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  caption: z.string().default(''),
  visibility: visibilityInputSchema,
  links: z.array(imageLinkSchema).default([]),
});

export type CreateCampaignImageInput = z.infer<typeof createCampaignImageInputSchema>;
export type UpdateCampaignImageInput = z.infer<typeof updateCampaignImageInputSchema>;

function parse(raw: unknown): CampaignImage {
  return campaignImageSchema.parse(raw);
}

export async function listCampaignImages(campaignId: CampaignId): Promise<CampaignImage[]> {
  const raw = await invoke<unknown[]>('list_campaign_images', { campaignId });
  return raw.map(parse);
}

export async function getCampaignImage(id: CampaignImageId): Promise<CampaignImage | null> {
  const raw: unknown = await invoke('get_campaign_image', { id });
  return raw === null ? null : parse(raw);
}

export async function createCampaignImage(input: CreateCampaignImageInput): Promise<CampaignImage> {
  const payload = parseBridgeInput(createCampaignImageInputSchema, input);
  const raw = await invoke<unknown>('create_campaign_image', { input: payload });
  return parse(raw);
}

export async function updateCampaignImage(input: UpdateCampaignImageInput): Promise<CampaignImage> {
  const payload = parseBridgeInput(updateCampaignImageInputSchema, input);
  const raw = await invoke<unknown>('update_campaign_image', { input: payload });
  return parse(raw);
}

export async function deleteCampaignImage(id: CampaignImageId): Promise<void> {
  return invoke<void>('delete_campaign_image', { id });
}

export async function attachCampaignImageFile(
  imageId: CampaignImageId,
  sourcePath: string,
): Promise<CampaignImage> {
  const raw = await invoke<unknown>('attach_campaign_image_file', { imageId, sourcePath });
  return parse(raw);
}

export async function resolveCampaignImagePath(
  campaignId: CampaignId,
  localPath: string,
): Promise<string> {
  return invoke<string>('resolve_campaign_image_path', { campaignId, localPath });
}
