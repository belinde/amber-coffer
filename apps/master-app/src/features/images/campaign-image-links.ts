import type { Campaign, CampaignImage, ImageLinkKind, ImageRef } from '@amber/shared';

import { listCampaignImages } from '../../bridge/campaign-images.js';
import type { VaultCategory } from '../vault/vault-categories.js';

import { imageRefHasDisplaySource } from './image-ref-match.js';

export function imageLinkKey(kind: ImageLinkKind, entityId: string): string {
  return `${kind}:${entityId}`;
}

export function vaultCategoryToImageLinkKind(category: VaultCategory): ImageLinkKind | null {
  switch (category) {
    case 'characters':
      return 'character';
    case 'npcs':
      return 'npc';
    case 'locations':
      return 'location';
    default:
      return null;
  }
}

export function indexCampaignImagesByLink(images: CampaignImage[]): Map<string, CampaignImage[]> {
  const map = new Map<string, CampaignImage[]>();
  for (const image of images) {
    for (const link of image.links) {
      const key = imageLinkKey(link.kind, link.id);
      const bucket = map.get(key) ?? [];
      bucket.push(image);
      map.set(key, bucket);
    }
  }
  return map;
}

export async function loadCampaignImageLinkIndex(
  campaignId: Campaign['id'],
): Promise<Map<string, CampaignImage[]>> {
  const images = await listCampaignImages(campaignId);
  return indexCampaignImagesByLink(images);
}

export async function listCampaignImagesLinkedTo(
  campaignId: Campaign['id'],
  kind: ImageLinkKind,
  entityId: string,
): Promise<CampaignImage[]> {
  const index = await loadCampaignImageLinkIndex(campaignId);
  return index.get(imageLinkKey(kind, entityId)) ?? [];
}

/** List/browse thumbnail: entity portrait first, else first linked archive image. */
export function pickDisplayImageRef(
  entityImage: ImageRef | null | undefined,
  linked: CampaignImage[],
): ImageRef | null | undefined {
  if (imageRefHasDisplaySource(entityImage)) return entityImage;
  for (const item of linked) {
    if (imageRefHasDisplaySource(item.image)) return item.image;
  }
  return entityImage;
}
