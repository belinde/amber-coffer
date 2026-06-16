import type { RecordingManifestChunk } from '@amber/shared';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ManifestBuilder } from '../src/manifest-builder.js';
import type { ChunkInput } from '../src/manifest-builder.js';

// -- Arbitraries --

/** Discord user IDs are numeric strings of 17-20 digits. */
const discordUserIdArb = fc.stringMatching(/^[0-9]{17,20}$/);

const displayNameArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0);

const relativePathArb = fc
  .tuple(discordUserIdArb, fc.integer({ min: 1_000_000_000, max: 2_147_483_647 }))
  .map(([userId, ts]) => `audio/discord/${userId}/${ts}.wav`);

/**
 * Generates a valid ChunkInput where endTime >= startTime >= sessionStartTime.
 */
const chunkInputArb: fc.Arbitrary<ChunkInput> = fc
  .tuple(
    discordUserIdArb,
    displayNameArb,
    relativePathArb,
    // sessionStartTime in ms (realistic range)
    fc.integer({ min: 1_700_000_000_000, max: 1_800_000_000_000 }),
    // offset from session start to chunk start (0..600_000 ms = up to 10 min)
    fc.integer({ min: 0, max: 600_000 }),
    // chunk duration in ms (1..60_000 ms = up to 60s)
    fc.integer({ min: 1, max: 60_000 }),
  )
  .map(([userId, name, path, sessionStart, offset, duration]) => ({
    discordUserId: userId,
    displayName: name,
    relativePath: path,
    sessionStartTime: sessionStart,
    startTime: sessionStart + offset,
    endTime: sessionStart + offset + duration,
  }));

/**
 * Generates a valid existing RecordingManifestChunk (could be opus_ogg or pcm_wav).
 */
const existingChunkArb: fc.Arbitrary<RecordingManifestChunk> = fc
  .tuple(
    discordUserIdArb,
    displayNameArb,
    relativePathArb,
    fc.integer({ min: 0, max: 600_000 }),
    fc.integer({ min: 1, max: 60_000 }),
    fc.constantFrom('opus_ogg' as const, 'pcm_wav' as const),
    fc.constantFrom(1 as const, 2 as const),
  )
  .map(
    ([userId, name, path, offsetMs, durationMs, codec, channels]) =>
      ({
        discordUserId: userId,
        displayName: name,
        relativePath: path,
        sessionOffsetMs: offsetMs,
        durationMs,
        codec,
        sampleRate: 48_000,
        channels,
      }) as RecordingManifestChunk,
  );

// Feature: session-recording-live-transcription, Property 6: Manifest audio metadata invariant
/**
 * Validates: Requirements 5.2, 5.3
 *
 * For any set of newly recorded chunks serialized to a manifest, every chunk
 * entry SHALL have codec "pcm_wav", sampleRate 48000, and channels 1.
 */
describe('Property 6: Manifest audio metadata invariant', () => {
  it('all new chunks have codec pcm_wav, sampleRate 48000, channels 1', () => {
    fc.assert(
      fc.property(fc.array(chunkInputArb, { minLength: 1, maxLength: 20 }), (inputs) => {
        const builder = new ManifestBuilder();
        for (const input of inputs) {
          builder.addChunk(input);
        }
        const chunks = builder.build();

        for (const chunk of chunks) {
          expect(chunk.codec).toBe('pcm_wav');
          expect(chunk.sampleRate).toBe(48_000);
          expect(chunk.channels).toBe(1);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: session-recording-live-transcription, Property 7: Manifest timing computation
/**
 * Validates: Requirements 5.4, 5.5
 *
 * For any chunk with a wall-clock start time and a session start time where
 * chunkStart >= sessionStart, sessionOffsetMs SHALL equal chunkStart - sessionStart
 * in milliseconds. For any chunk with wall-clock start and end times where
 * end >= start, durationMs SHALL equal end - start in milliseconds.
 */
describe('Property 7: Manifest timing computation', () => {
  it('sessionOffsetMs = chunkStart - sessionStart; durationMs = end - start', () => {
    fc.assert(
      fc.property(chunkInputArb, (input) => {
        const builder = new ManifestBuilder();
        builder.addChunk(input);
        const [chunk] = builder.build();

        const expectedOffset = input.startTime - input.sessionStartTime;
        const expectedDuration = input.endTime - input.startTime;

        expect(chunk.sessionOffsetMs).toBe(expectedOffset);
        expect(chunk.durationMs).toBe(expectedDuration);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: session-recording-live-transcription, Property 9: Manifest merge preserves existing chunks
/**
 * Validates: Requirements 5.8
 *
 * For any valid existing manifest with N chunks and any set of M new chunks,
 * merging SHALL produce a manifest with exactly N + M chunks where the first
 * N chunks are byte-for-byte identical to the original chunks.
 */
describe('Property 9: Manifest merge preserves existing chunks', () => {
  it('merged output has N + M chunks, first N identical to originals', () => {
    fc.assert(
      fc.property(
        fc.array(existingChunkArb, { minLength: 0, maxLength: 10 }),
        fc.array(chunkInputArb, { minLength: 0, maxLength: 10 }),
        (existingChunks, newInputs) => {
          const builder = new ManifestBuilder();
          builder.mergeExisting(existingChunks);
          for (const input of newInputs) {
            builder.addChunk(input);
          }
          const result = builder.build();

          // Total count is N + M
          expect(result).toHaveLength(existingChunks.length + newInputs.length);

          // First N chunks are identical to the originals
          for (let i = 0; i < existingChunks.length; i++) {
            expect(result[i]).toEqual(existingChunks[i]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
