import * as fc from 'fast-check';
import { describe, it } from 'vitest';

import { mergeTranscriptSegments } from './merge-transcript-segments.js';
import type { WhisperSegment } from './whisper-sidecar.schema.js';

/**
 * Validates: Requirements 3.4
 *
 * Preservation property: mergeTranscriptSegments sorts all segments
 * chronologically by absolute start time regardless of speaker identity.
 */
describe('mergeTranscriptSegments — preservation property', () => {
  const whisperSegmentArb: fc.Arbitrary<WhisperSegment> = fc
    .record({
      start: fc.float({ min: 0, max: 7200, noNaN: true }),
      end: fc.float({ min: 0, max: 7200, noNaN: true }),
      text: fc.string({ minLength: 1, maxLength: 50 }),
      speaker: fc.stringMatching(/^[A-Za-z][A-Za-z0-9_ ]{0,19}$/),
    })
    .map((seg) => ({
      ...seg,
      end: Math.max(seg.start, seg.end),
    }));

  function parseTimestamps(result: string): number[] {
    if (result === '') return [];
    const lines = result.split('\n');
    const timestampRegex = /^\[(\d{2}):(\d{2}):(\d{2})\]/;
    const timestamps: number[] = [];
    for (const line of lines) {
      const match = timestampRegex.exec(line);
      if (!match) continue;
      const h = Number.parseInt(match[1] ?? '0', 10);
      const m = Number.parseInt(match[2] ?? '0', 10);
      const s = Number.parseInt(match[3] ?? '0', 10);
      timestamps.push(h * 3600 + m * 60 + s);
    }
    return timestamps;
  }

  function isNonDecreasing(arr: number[]): boolean {
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1];
      const curr = arr[i];
      if (prev !== undefined && curr !== undefined && curr < prev) {
        return false;
      }
    }
    return true;
  }

  it('output lines are sorted by non-decreasing start time for any segment array', () => {
    fc.assert(
      fc.property(fc.array(whisperSegmentArb, { minLength: 2, maxLength: 30 }), (segments) => {
        const result = mergeTranscriptSegments(segments);
        const timestamps = parseTimestamps(result);
        return isNonDecreasing(timestamps);
      }),
      { numRuns: 200 },
    );
  });

  it('preserves all segments in output (one line per segment)', () => {
    fc.assert(
      fc.property(fc.array(whisperSegmentArb, { minLength: 1, maxLength: 20 }), (segments) => {
        const result = mergeTranscriptSegments(segments);
        const lines = result === '' ? [] : result.split('\n');
        return lines.length === segments.length;
      }),
      { numRuns: 200 },
    );
  });

  it('multiple speakers are interleaved by start time, not grouped by speaker', () => {
    fc.assert(
      fc.property(
        fc.array(whisperSegmentArb, { minLength: 3, maxLength: 20 }).filter((segs) => {
          const speakers = new Set(segs.map((s) => s.speaker));
          return speakers.size >= 2;
        }),
        (segments) => {
          const result = mergeTranscriptSegments(segments);
          const timestamps = parseTimestamps(result);
          return isNonDecreasing(timestamps);
        },
      ),
      { numRuns: 200 },
    );
  });
});
