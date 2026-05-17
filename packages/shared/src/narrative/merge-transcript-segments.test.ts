import { describe, expect, it } from 'vitest';

import { mergeTranscriptSegments } from './merge-transcript-segments.js';

describe('mergeTranscriptSegments', () => {
  it('sorts by start time and formats lines', () => {
    const merged = mergeTranscriptSegments([
      { start: 65, end: 70, text: 'second', speaker: 'Bob' },
      { start: 5, end: 10, text: 'first', speaker: 'Alice' },
    ]);
    expect(merged).toBe('[00:00:05] Alice: first\n[00:01:05] Bob: second');
  });

  it('returns empty string for no segments', () => {
    expect(mergeTranscriptSegments([])).toBe('');
  });
});
