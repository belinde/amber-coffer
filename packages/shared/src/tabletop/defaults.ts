/**
 * Canonical tabletop geometry for master-app and player-activity.
 * Logical grid: 24×18 cells at 50px → 1200×900 px (4:3 viewport).
 */
export const TABLETOP_GRID_COLS = 24;
export const TABLETOP_GRID_ROWS = 18;
export const TABLETOP_GRID_SIZE_PX = 50;
export const TABLETOP_BENCH_SLOTS = 12;

export const TABLETOP_VIEWPORT_WIDTH_PX = 1920;
export const TABLETOP_VIEWPORT_HEIGHT_PX = 1440;

/** CSS aspect-ratio when no map background image is set. */
export const DEFAULT_TABLETOP_BOARD_ASPECT_RATIO = '4 / 3';

/** CSS `aspect-ratio` for a square-cell grid (width-driven layout). */
export function tabletopGridAspectRatio(gridCols: number, gridRows: number): string {
  if (gridCols > 0 && gridRows > 0) {
    return `${gridCols} / ${gridRows}`;
  }
  return DEFAULT_TABLETOP_BOARD_ASPECT_RATIO;
}
