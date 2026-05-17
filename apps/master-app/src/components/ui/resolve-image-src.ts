import type { ImageRef } from '@amber/shared';

/**
 * Resolves a display URL for list thumbnails.
 * Cloud URLs work today; local paths need the campaign image service (ADR 0006).
 */
export function resolveImageDisplayUrl(image: ImageRef | null | undefined): string | null {
  if (!image) return null;
  if (image.thumbnailUrl) return image.thumbnailUrl;
  if (image.canonUrl) return image.canonUrl;
  return null;
}
