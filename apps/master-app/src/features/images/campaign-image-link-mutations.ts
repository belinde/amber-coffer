import type { CampaignImage, ImageLink, ImageLinkKind } from '@amber/shared';

import { updateCampaignImage } from '../../bridge/campaign-images.js';

function linkKey(link: ImageLink): string {
  return `${link.kind}:${link.id}`;
}

export function campaignImageHasLink(
  item: CampaignImage,
  kind: ImageLinkKind,
  entityId: string,
): boolean {
  return item.links.some((link) => link.kind === kind && link.id === entityId);
}

export async function addCampaignImageLink(
  item: CampaignImage,
  link: ImageLink,
): Promise<CampaignImage> {
  const key = linkKey(link);
  if (item.links.some((existing) => linkKey(existing) === key)) {
    return item;
  }
  return updateCampaignImage({
    id: item.id,
    title: item.title,
    caption: item.caption,
    visibility: item.visibility,
    links: [...item.links, link],
  });
}

export async function removeCampaignImageLink(
  item: CampaignImage,
  kind: ImageLinkKind,
  entityId: string,
): Promise<CampaignImage> {
  return updateCampaignImage({
    id: item.id,
    title: item.title,
    caption: item.caption,
    visibility: item.visibility,
    links: item.links.filter((link) => !(link.kind === kind && link.id === entityId)),
  });
}
