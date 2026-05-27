import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { truncateCampaignName } from './SessionHeader.js';

/**
 * Validates: Requirements 6.1
 *
 * Property 10: Campaign Name Truncation
 * For any string, if length > 40 display first 40 chars + "…", otherwise display unchanged.
 */
describe('Feature: image-sync-and-tabletop-tokens, Property 10: Campaign Name Truncation', () => {
  it('returns strings of length ≤ 40 unchanged', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 40 }), (name) => {
        expect(truncateCampaignName(name)).toBe(name);
      }),
      { numRuns: 100 },
    );
  });

  it('truncates strings of length > 40 to first 40 chars + ellipsis', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 41, maxLength: 500 }), (name) => {
        const result = truncateCampaignName(name);
        expect(result).toBe(name.slice(0, 40) + '\u2026');
        expect(result.length).toBe(41);
      }),
      { numRuns: 100 },
    );
  });
});
