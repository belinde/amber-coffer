import type { CampaignImage, ImageRef } from '@amber/shared';

export function imageRefHasDisplaySource(ref: ImageRef | null | undefined): boolean {
  if (!ref) return false;
  return Boolean(ref.local ?? ref.thumbnailUrl ?? ref.canonUrl);
}

export function imageRefsEqual(
  a: ImageRef | null | undefined,
  b: ImageRef | null | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.local && b.local && a.local === b.local) return true;
  if (a.hash && b.hash && a.hash === b.hash) return true;
  if (a.canonUrl && b.canonUrl && a.canonUrl === b.canonUrl) return true;
  if (a.thumbnailUrl && b.thumbnailUrl && a.thumbnailUrl === b.thumbnailUrl) return true;
  return false;
}

export function findCampaignImageByRef(
  images: readonly CampaignImage[],
  ref: ImageRef | null | undefined,
): CampaignImage | undefined {
  if (!ref || !imageRefHasDisplaySource(ref)) return undefined;
  return images.find((item) => imageRefsEqual(item.image, ref));
}

export function filterCampaignImagesByQuery(
  images: readonly CampaignImage[],
  query: string,
): CampaignImage[] {
  const q = query.trim().toLowerCase();
  const selectable = images.filter((item) => imageRefHasDisplaySource(item.image));
  if (!q) return selectable;
  return selectable.filter(
    (item) =>
      item.title.toLowerCase().includes(q) || item.caption.toLowerCase().includes(q),
  );
}
