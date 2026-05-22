import { describe, expect, it } from 'vitest';

import { DEFAULT_TABLETOP_BOARD_ASPECT_RATIO, tabletopGridAspectRatio } from './defaults.js';

describe('tabletopGridAspectRatio', () => {
  it('returns cols / rows for square cells', () => {
    expect(tabletopGridAspectRatio(24, 18)).toBe('24 / 18');
  });

  it('falls back when dimensions are invalid', () => {
    expect(tabletopGridAspectRatio(0, 18)).toBe(DEFAULT_TABLETOP_BOARD_ASPECT_RATIO);
  });
});
