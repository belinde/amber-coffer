import type { Map } from '../world-state/map.schema.js';

import { DEFAULT_TABLETOP_BOARD_ASPECT_RATIO } from './defaults.js';

export function tabletopBoardAspectRatio(
  map: Pick<Map, 'imagePath' | 'widthPx' | 'heightPx' | 'backgroundPublicPath'>,
): string {
  const hasBackground =
    map.imagePath.trim().length > 0 || Boolean(map.backgroundPublicPath?.trim());
  if (hasBackground && map.widthPx > 0 && map.heightPx > 0) {
    return `${map.widthPx} / ${map.heightPx}`;
  }
  return DEFAULT_TABLETOP_BOARD_ASPECT_RATIO;
}
