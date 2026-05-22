import { TABLETOP_BENCH_SLOTS, tabletopBoardAspectRatio, type Map } from '@amber/shared';
import type { CSSProperties } from 'react';

export type TabletopMapLayout = Pick<
  Map,
  | 'imagePath'
  | 'widthPx'
  | 'heightPx'
  | 'gridCols'
  | 'gridRows'
  | 'gridSizePx'
  | 'benchSlots'
  | 'backgroundPublicPath'
>;

export type TabletopGridConfig = {
  cols: number;
  rows: number;
  benchSlots: number;
  gridSizePx: number;
};

export function tabletopGridConfigFromMap(map: TabletopMapLayout): TabletopGridConfig {
  return {
    cols: map.gridCols,
    rows: map.gridRows,
    benchSlots: map.benchSlots ?? TABLETOP_BENCH_SLOTS,
    gridSizePx: map.gridSizePx,
  };
}

export function buildTabletopBoardStyles(
  map: TabletopMapLayout,
  backgroundImageUrl?: string | null,
): { boardStyle: CSSProperties; gridStyle: CSSProperties } {
  const grid = tabletopGridConfigFromMap(map);
  return {
    boardStyle: {
      '--grid-aspect-ratio': tabletopBoardAspectRatio(map),
      '--grid-cols': grid.cols,
      '--grid-rows': grid.rows,
      ...(backgroundImageUrl ? { '--board-bg-image': `url("${backgroundImageUrl}")` } : {}),
    } as CSSProperties,
    gridStyle: {
      '--grid-cols': grid.cols,
      '--grid-rows': grid.rows,
    } as CSSProperties,
  };
}
