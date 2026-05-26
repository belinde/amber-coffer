import { describe, expect, it } from 'vitest';

import { tabletopBoardAspectRatio } from './board-aspect-ratio.js';
import { DEFAULT_TABLETOP_BOARD_ASPECT_RATIO } from './defaults.js';

describe('tabletopBoardAspectRatio', () => {
  it('uses 4/3 when there is no background image', () => {
    expect(
      tabletopBoardAspectRatio({
        imagePath: '',
        widthPx: 1920,
        heightPx: 1080,
        gridCols: 24,
        gridRows: 18,
      }),
    ).toBe(DEFAULT_TABLETOP_BOARD_ASPECT_RATIO);
  });

  it('uses grid dimensions when a local background is set', () => {
    expect(
      tabletopBoardAspectRatio({
        imagePath: 'maps/table.webp',
        widthPx: 1920,
        heightPx: 1080,
        gridCols: 24,
        gridRows: 14,
      }),
    ).toBe('24 / 14');
  });

  it('uses grid dimensions when only backgroundPublicPath is set', () => {
    expect(
      tabletopBoardAspectRatio({
        imagePath: '',
        backgroundPublicPath: '/session-assets/x.webp',
        widthPx: 1920,
        heightPx: 1080,
        gridCols: 24,
        gridRows: 14,
      }),
    ).toBe('24 / 14');
  });

  it('falls back to default when gridCols or gridRows is zero', () => {
    expect(
      tabletopBoardAspectRatio({
        imagePath: 'maps/table.webp',
        widthPx: 1920,
        heightPx: 1080,
        gridCols: 0,
        gridRows: 0,
      }),
    ).toBe(DEFAULT_TABLETOP_BOARD_ASPECT_RATIO);
  });
});
