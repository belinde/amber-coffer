import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { classifyVolume } from '../src/chunk-validator.js';

// Feature: session-recording-live-transcription, Property 5: Silence threshold decision
/**
 * Validates: Requirements 4.2
 *
 * For any mean volume value in dBFS, the silence decision function returns
 * `silent` if and only if the value is strictly below -50 dBFS, and `valid` otherwise.
 */
describe('Property 5: Silence threshold decision', () => {
  const SILENCE_THRESHOLD = -50;

  it('returns "silent" for any dBFS value strictly below -50', () => {
    fc.assert(
      fc.property(
        fc
          .double({ min: -200, max: SILENCE_THRESHOLD, noNaN: true, noDefaultInfinity: true })
          .filter((v) => v < SILENCE_THRESHOLD),
        (dbfs) => {
          expect(classifyVolume(dbfs, SILENCE_THRESHOLD)).toBe('silent');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns "valid" for any dBFS value >= -50', () => {
    fc.assert(
      fc.property(
        fc.double({ min: SILENCE_THRESHOLD, max: 0, noNaN: true, noDefaultInfinity: true }),
        (dbfs) => {
          expect(classifyVolume(dbfs, SILENCE_THRESHOLD)).toBe('valid');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('decision is "silent" iff value < -50 for any finite dBFS value', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -200, max: 0, noNaN: true, noDefaultInfinity: true }),
        (dbfs) => {
          const result = classifyVolume(dbfs, SILENCE_THRESHOLD);
          if (dbfs < SILENCE_THRESHOLD) {
            expect(result).toBe('silent');
          } else {
            expect(result).toBe('valid');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
