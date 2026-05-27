import type { Campaign, ImageRef } from '@amber/shared';
import { convertFileSrc } from '@tauri-apps/api/core';

import { resolveCampaignImagePath } from '../../bridge/campaign-images.js';

import { resolveImageDisplayUrl } from './resolve-image-src.js';

const cache = new Map<string, string>();

function cacheKey(campaignId: Campaign['id'], local: string): string {
  return `${campaignId}:${local}`;
}

/** Resolves cloud URLs synchronously; local L1 paths via Tauri convertFileSrc. */
export async function resolveImageDisplayUrlAsync(
  campaignId: Campaign['id'],
  image: ImageRef | null | undefined,
): Promise<string | null> {
  const remote = resolveImageDisplayUrl(image);
  if (remote) return remote;
  const local = image?.local;
  if (!local) return null;

  const key = cacheKey(campaignId, local);
  const cached = cache.get(key);
  if (cached) return cached;

  const absolute = await resolveCampaignImagePath(campaignId, local);
  const url = convertFileSrc(absolute);
  cache.set(key, url);
  return url;
}

/** Resolves the full-size local image URL, bypassing cloud thumbnails. For use in preview modals. */
export async function resolveFullSizeImageUrlAsync(
  campaignId: Campaign['id'],
  image: ImageRef | null | undefined,
): Promise<string | null> {
  const local = image?.local;
  if (!local) return null;

  const key = cacheKey(campaignId, local);
  const cached = cache.get(key);
  if (cached) return cached;

  const absolute = await resolveCampaignImagePath(campaignId, local);
  const url = convertFileSrc(absolute);
  cache.set(key, url);
  return url;
}

export function clearImageDisplayUrlCache(): void {
  cache.clear();
}
