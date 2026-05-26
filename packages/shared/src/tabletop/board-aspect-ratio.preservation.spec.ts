import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { tabletopBoardAspectRatio } from './board-aspect-ratio.js';
import { DEFAULT_TABLETOP_BOARD_ASPECT_RATIO, tabletopGridAspectRatio } from './defaults.js';

/**
 * Preservation Property Tests — Default Grid and No-Background Behavior Unchanged
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * These tests capture the baseline behavior that MUST be preserved after the fix:
 * - Maps without backgrounds always return '4 / 3' aspect ratio
 * - `tabletopGridAspectRatio` returns `gridCols / gridRows` for positive values
 *   and falls back to '4 / 3' for zero/negative
 *
 * These tests PASS on UNFIXED code (confirming the behavior to preserve).
 */
describe('Preservation: Default Grid and No-Background Behavior Unchanged', () => {
  it('property: maps without background always return default 4/3 aspect ratio', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4000 }), // widthPx
        fc.integer({ min: 1, max: 4000 }), // heightPx
        fc.integer({ min: 8, max: 48 }), // gridCols
        fc.integer({ min: 1, max: 100 }), // gridRows
        fc.oneof(fc.constant(undefined), fc.constant('')), // backgroundPublicPath
        (widthPx, heightPx, gridCols, gridRows, backgroundPublicPath) => {
          const map = {
            imagePath: '',
            widthPx,
            heightPx,
            gridCols,
            gridRows,
            backgroundPublicPath,
          };

          const result = tabletopBoardAspectRatio(map);

          expect(
            result,
            `For map without background (imagePath='', backgroundPublicPath=${JSON.stringify(backgroundPublicPath)}): ` +
              `expected "${DEFAULT_TABLETOP_BOARD_ASPECT_RATIO}" but got "${result}".`,
          ).toBe(DEFAULT_TABLETOP_BOARD_ASPECT_RATIO);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('property: tabletopGridAspectRatio returns gridCols/gridRows for positive values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }), // gridCols
        fc.integer({ min: 1, max: 100 }), // gridRows
        (gridCols, gridRows) => {
          const result = tabletopGridAspectRatio(gridCols, gridRows);
          const expected = `${gridCols} / ${gridRows}`;

          expect(
            result,
            `For gridCols=${gridCols}, gridRows=${gridRows}: ` +
              `expected "${expected}" but got "${result}".`,
          ).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('property: tabletopGridAspectRatio returns default for zero or negative values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 0 }), // gridCols (zero or negative)
        fc.integer({ min: -100, max: 100 }), // gridRows (any)
        (gridCols, gridRows) => {
          const result = tabletopGridAspectRatio(gridCols, gridRows);

          expect(
            result,
            `For gridCols=${gridCols}, gridRows=${gridRows}: ` +
              `expected "${DEFAULT_TABLETOP_BOARD_ASPECT_RATIO}" but got "${result}".`,
          ).toBe(DEFAULT_TABLETOP_BOARD_ASPECT_RATIO);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('property: tabletopGridAspectRatio returns default when gridRows is zero or negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }), // gridCols (positive)
        fc.integer({ min: -100, max: 0 }), // gridRows (zero or negative)
        (gridCols, gridRows) => {
          const result = tabletopGridAspectRatio(gridCols, gridRows);

          expect(
            result,
            `For gridCols=${gridCols}, gridRows=${gridRows}: ` +
              `expected "${DEFAULT_TABLETOP_BOARD_ASPECT_RATIO}" but got "${result}".`,
          ).toBe(DEFAULT_TABLETOP_BOARD_ASPECT_RATIO);
        },
      ),
      { numRuns: 100 },
    );
  });
});
