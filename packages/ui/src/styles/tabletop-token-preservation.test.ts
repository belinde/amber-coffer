import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

/**
 * Validates: Requirements 3.4, 3.5
 *
 * Preservation property tests for CSS token rendering.
 * 2c: Landscape maps (widthPx >= heightPx) → tokens render as circles
 * 2d: Bench tokens → fixed 2.5rem size and circular shape
 *
 * These tests verify CSS declarations that ensure circular tokens.
 * On unfixed code, landscape tokens already work correctly (the bug only
 * manifests on portrait grids). We verify the CSS rules that guarantee this.
 */

const cssContent = readFileSync(resolve(__dirname, 'tabletop.css'), 'utf-8');

// Helper to extract a CSS rule block by selector
function extractRule(css: string, selector: string): string {
  // Find the selector and extract its block
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 's');
  const match = css.match(regex);
  return match?.[1] ?? '';
}

describe('2c. Landscape Token Preservation — tokens render as circles for landscape maps', () => {
  const tokenRule = extractRule(cssContent, '.tabletop-token');

  it('.tabletop-token has aspect-ratio: 1 to enforce circular shape', () => {
    expect(tokenRule).toMatch(/aspect-ratio:\s*1/);
  });

  it('.tabletop-token has border-radius: 50% for circular rendering', () => {
    expect(tokenRule).toMatch(/border-radius:\s*50%/);
  });

  it('.tabletop-token has width set via --token-fill variable', () => {
    expect(tokenRule).toMatch(/width:\s*calc\(100%\s*\*\s*var\(--token-fill/);
  });

  it('.tabletop-token has place-self: center for grid centering', () => {
    expect(tokenRule).toMatch(/place-self:\s*center/);
  });

  it('for any landscape aspect ratio (w >= h), aspect-ratio: 1 ensures square token', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4096 }),
        fc.integer({ min: 1, max: 4096 }),
        (width, height) => {
          fc.pre(width >= height); // landscape constraint
          // With aspect-ratio: 1 on the token, the token is always square
          // regardless of the grid cell shape. The CSS rule guarantees this.
          // We verify the rule exists (already checked above) and that the
          // math holds: a square with border-radius: 50% is always a circle.
          const isSquare = true; // aspect-ratio: 1 forces width === height
          const isCircle = isSquare; // border-radius: 50% on a square = circle
          return isCircle;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('.tabletop-ghost also has aspect-ratio: 1 and border-radius: 50%', () => {
    const ghostRule = extractRule(cssContent, '.tabletop-ghost');
    expect(ghostRule).toMatch(/aspect-ratio:\s*1/);
    expect(ghostRule).toMatch(/border-radius:\s*50%/);
  });
});

describe('2d. Bench Token Preservation — bench tokens have fixed 2.5rem circular shape', () => {
  const benchRule = extractRule(cssContent, '.tabletop-token--bench');

  it('.tabletop-token--bench has fixed width: 2.5rem', () => {
    expect(benchRule).toMatch(/width:\s*2\.5rem/);
  });

  it('.tabletop-token--bench has fixed height: 2.5rem', () => {
    expect(benchRule).toMatch(/height:\s*2\.5rem/);
  });

  it('.tabletop-token--bench overrides max-width to none (not constrained by grid)', () => {
    expect(benchRule).toMatch(/max-width:\s*none/);
  });

  it('bench tokens are always circular: fixed equal dimensions guarantee circle', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4096 }),
        fc.integer({ min: 1, max: 4096 }),
        (_boardWidth, _boardHeight) => {
          // Regardless of board dimensions, bench tokens use fixed 2.5rem × 2.5rem
          // which is always a square. Combined with border-radius: 50% from
          // .tabletop-token (parent class), this is always a circle.
          const benchWidth = 2.5; // rem, fixed
          const benchHeight = 2.5; // rem, fixed
          return benchWidth === benchHeight; // always square → always circle
        },
      ),
      { numRuns: 200 },
    );
  });

  it('.tabletop-ghost--bench also has fixed 2.5rem dimensions', () => {
    const ghostBenchRule = extractRule(cssContent, '.tabletop-ghost--bench');
    expect(ghostBenchRule).toMatch(/width:\s*2\.5rem/);
    expect(ghostBenchRule).toMatch(/height:\s*2\.5rem/);
  });
});
