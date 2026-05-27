import type { Map as TabletopMap } from '@amber/shared';
import { mapSchema } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

export const campaignImagePickerEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  thumbnailPath: z.string().nullable(),
  widthPx: z.number().int().positive().nullable(),
  heightPx: z.number().int().positive().nullable(),
  linkKinds: z.array(z.string()).default([]),
});

export type CampaignImagePickerEntry = z.infer<typeof campaignImagePickerEntrySchema>;

export async function getCampaignImagesForPicker(
  campaignId: string,
): Promise<CampaignImagePickerEntry[]> {
  const raw = await invoke<unknown[]>('get_campaign_images_for_picker_cmd', { campaignId });
  return raw.map((entry) => campaignImagePickerEntrySchema.parse(entry));
}

export async function setMapBackgroundFromImage(
  mapId: string,
  campaignImageId: string,
): Promise<TabletopMap> {
  const raw = await invoke<unknown>('set_map_background_from_image_cmd', {
    mapId,
    campaignImageId,
  });
  return mapSchema.parse(raw);
}
