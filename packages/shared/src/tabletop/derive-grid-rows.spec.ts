import { describe, expect, it } from 'vitest';

import { deriveGridRows, TABLETOP_GRID_ROWS } from './defaults.js';

describe('deriveGridRows', () => {
  it('returns ceil(gridCols * heightPx / widthPx) for portrait image', () => {
    expect(deriveGridRows(24, 1080, 1920)).toBe(43);
  });

  it('returns ceil(gridCols * heightPx / widthPx) for landscape image', () => {
    expect(deriveGridRows(24, 1920, 1080)).toBe(14);
  });

  it('returns TABLETOP_GRID_ROWS when widthPx is zero', () => {
    expect(deriveGridRows(24, 0, 1080)).toBe(TABLETOP_GRID_ROWS);
  });

  it('returns TABLETOP_GRID_ROWS when heightPx is zero', () => {
    expect(deriveGridRows(24, 1080, 0)).toBe(TABLETOP_GRID_ROWS);
  });

  it('returns TABLETOP_GRID_ROWS when both dimensions are zero', () => {
    expect(deriveGridRows(24, 0, 0)).toBe(TABLETOP_GRID_ROWS);
  });

  it('returns TABLETOP_GRID_ROWS when widthPx is negative', () => {
    expect(deriveGridRows(24, -100, 1080)).toBe(TABLETOP_GRID_ROWS);
  });

  it('returns TABLETOP_GRID_ROWS when heightPx is negative', () => {
    expect(deriveGridRows(24, 1080, -100)).toBe(TABLETOP_GRID_ROWS);
  });

  it('returns gridCols for a square image', () => {
    expect(deriveGridRows(24, 1000, 1000)).toBe(24);
  });
});
