import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { tabletopBoardAspectRatio } from './board-aspect-ratio.js';

/**
 * Bug Condition Exploration Test — Non-Square Grid Cells on Background Upload
 *
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
 *
 * This test encodes the EXPECTED behavior: `tabletopBoardAspectRatio` should
 * return `gridCols / gridRows` (where `gridRows = ceil(gridCols * heightPx / widthPx)`)
 * to ensure square grid cells.
 *
 * On UNFIXED code this test FAILS — confirming the bug condition is active
 * (aspect ratio uses pixel dimensions `widthPx / heightPx` instead of grid dimensions).
 *
 * After the fix, this test PASSES — confirming the bug is resolved.
 */
describe('Bug Condition: Non-Square Grid Cells on Background Upload', () => {
  it('property: board aspect ratio uses grid dimensions, not pixel dimensions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 4000 }), // widthPx
        fc.integer({ min: 100, max: 4000 }), // heightPx
        fc.integer({ min: 8, max: 48 }), // gridCols
        (widthPx, heightPx, gridCols) => {
          const gridRows = Math.ceil((gridCols * heightPx) / widthPx);

          // Pass grid dimensions alongside pixel dimensions.
          // The current (unfixed) function ignores gridCols/gridRows and uses widthPx/heightPx.
          // The fixed function will use gridCols/gridRows for the aspect ratio.
          const map = {
            imagePath: 'bg.webp',
            widthPx,
            heightPx,
            gridCols,
            gridRows,
          };

          const result = tabletopBoardAspectRatio(map);

          // Expected: aspect ratio driven by grid dimensions for square cells
          const expected = `${gridCols} / ${gridRows}`;

          expect(
            result,
            `For widthPx=${widthPx}, heightPx=${heightPx}, gridCols=${gridCols}, gridRows=${gridRows}: ` +
              `expected "${expected}" but got "${result}". ` +
              `The function uses pixel dimensions instead of grid dimensions, ` +
              `producing non-square cells.`,
          ).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});
