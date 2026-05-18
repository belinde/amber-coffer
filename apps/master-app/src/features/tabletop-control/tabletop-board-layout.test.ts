import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TABLETOP_BOARD_ASPECT_RATIO,
  tabletopBoardAspectRatio,
} from './tabletop-board-layout.js';

describe('tabletopBoardAspectRatio', () => {
  it('uses 4/3 when there is no background image', () => {
    expect(tabletopBoardAspectRatio({ imagePath: '', widthPx: 1920, heightPx: 1080 })).toBe(
      DEFAULT_TABLETOP_BOARD_ASPECT_RATIO,
    );
  });

  it('uses map pixel dimensions when a background is set', () => {
    expect(
      tabletopBoardAspectRatio({ imagePath: 'maps/table.webp', widthPx: 1920, heightPx: 1080 }),
    ).toBe('1920 / 1080');
  });
});
