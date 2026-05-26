import type { Map } from '../world-state/map.schema.js';

import { DEFAULT_TABLETOP_BOARD_ASPECT_RATIO } from './defaults.js';

export function tabletopBoardAspectRatio(
  map: Pick<
    Map,
    'imagePath' | 'widthPx' | 'heightPx' | 'gridCols' | 'gridRows' | 'backgroundPublicPath'
  >,
): string {
  const hasBackground =
    map.imagePath.trim().length > 0 || Boolean(map.backgroundPublicPath?.trim());
  if (hasBackground && map.gridCols > 0 && map.gridRows > 0) {
    return `${map.gridCols} / ${map.gridRows}`;
  }
  return DEFAULT_TABLETOP_BOARD_ASPECT_RATIO;
}
