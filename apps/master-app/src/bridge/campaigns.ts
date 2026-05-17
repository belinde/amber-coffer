import { campaignSchema, type Campaign } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

import { parseBridgeInput } from './parse-bridge-input.js';

type CampaignId = Campaign['id'];

const createCampaignInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  discordChannelId: z.string().nullable().optional(),
});

export type CreateCampaignInput = z.infer<typeof createCampaignInputSchema>;

function parseCampaign(raw: unknown): Campaign {
  return campaignSchema.parse(raw);
}

export async function listCampaigns(): Promise<Campaign[]> {
  const raw = await invoke<unknown[]>('list_campaigns');
  return raw.map(parseCampaign);
}

export async function getCampaign(id: CampaignId): Promise<Campaign | null> {
  const raw: unknown = await invoke('get_campaign', { id });
  return raw === null ? null : parseCampaign(raw);
}

export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  const payload = parseBridgeInput(createCampaignInputSchema, input);
  const raw = await invoke<unknown>('create_campaign', { input: payload });
  return parseCampaign(raw);
}

const updateCampaignInputSchema = z.object({
  id: z.string().min(1),
  discordChannelId: z.string().nullable(),
});

export type UpdateCampaignInput = z.infer<typeof updateCampaignInputSchema>;

export async function updateCampaign(input: UpdateCampaignInput): Promise<Campaign> {
  const payload = parseBridgeInput(updateCampaignInputSchema, input);
  const raw = await invoke<unknown>('update_campaign', { input: payload });
  return parseCampaign(raw);
}
