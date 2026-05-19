import type { Map } from '@amber/shared';

/** Landscape board when no map background is assigned yet. */
export const DEFAULT_TABLETOP_BOARD_ASPECT_RATIO = '4 / 3';

export function tabletopBoardAspectRatio(
  map: Pick<Map, 'imagePath' | 'widthPx' | 'heightPx'>,
): string {
  const hasBackground = map.imagePath.trim().length > 0;
  if (hasBackground && map.widthPx > 0 && map.heightPx > 0) {
    return `${map.widthPx} / ${map.heightPx}`;
  }
  return DEFAULT_TABLETOP_BOARD_ASPECT_RATIO;
}
