import { describe, expect, it } from 'vitest';

import { tabletopBoardAspectRatio } from './board-aspect-ratio.js';
import { DEFAULT_TABLETOP_BOARD_ASPECT_RATIO } from './defaults.js';

describe('tabletopBoardAspectRatio', () => {
  it('uses 4/3 when there is no background image', () => {
    expect(tabletopBoardAspectRatio({ imagePath: '', widthPx: 1920, heightPx: 1080 })).toBe(
      DEFAULT_TABLETOP_BOARD_ASPECT_RATIO,
    );
  });

  it('uses map pixel dimensions when a local background is set', () => {
    expect(
      tabletopBoardAspectRatio({ imagePath: 'maps/table.webp', widthPx: 1920, heightPx: 1080 }),
    ).toBe('1920 / 1080');
  });

  it('uses map pixel dimensions when only backgroundPublicPath is set', () => {
    expect(
      tabletopBoardAspectRatio({
        imagePath: '',
        backgroundPublicPath: '/session-assets/x.webp',
        widthPx: 1920,
        heightPx: 1080,
      }),
    ).toBe('1920 / 1080');
  });
});
