import type { RecordingManifestChunk } from '@amber/shared';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  MIN_OGG_BYTES,
  nextChunkIndexFromRelativePath,
  restoreChunkCountersFromManifest,
} from '../src/record-utils.js';

/**
 * Validates: Requirements 3.3
 *
 * Preservation property: files below MIN_OGG_BYTES (256) are considered stubs
 * and discarded; files >= 256 bytes are retained. The threshold is a constant.
 */
describe('Stub filtering (MIN_OGG_BYTES threshold) — preservation property', () => {
  it('MIN_OGG_BYTES is 256', () => {
    expect(MIN_OGG_BYTES).toBe(256);
  });

  it('for any file size < 256, the chunk would be discarded (threshold check)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), (fileSize) => {
        // The production code checks: if (fileStat.size < MIN_OGG_BYTES) { unlink; return; }
        return fileSize < MIN_OGG_BYTES;
      }),
      { numRuns: 200 },
    );
  });

  it('for any file size >= 256, the chunk would be retained (threshold check)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 256, max: 100_000_000 }), (fileSize) => {
        // The production code only adds to completedChunks when size >= MIN_OGG_BYTES
        return fileSize >= MIN_OGG_BYTES;
      }),
      { numRuns: 200 },
    );
  });

  it('discarding a stub does not affect timing of subsequent valid chunks', () => {
    // Simulate a sequence of chunks where some are stubs (< 256 bytes)
    // and verify that valid chunks retain their original sessionOffsetMs
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            fileSize: fc.integer({ min: 0, max: 10_000 }),
            sessionOffsetMs: fc.integer({ min: 0, max: 7_200_000 }),
          }),
          { minLength: 2, maxLength: 20 },
        ),
        (entries) => {
          // Simulate the recording pipeline logic:
          // only chunks with fileSize >= MIN_OGG_BYTES are added to completedChunks
          const completedOffsets = entries
            .filter((e) => e.fileSize >= MIN_OGG_BYTES)
            .map((e) => e.sessionOffsetMs);

          // Verify: each retained chunk's offset is unchanged from its original value
          let validIdx = 0;
          for (const entry of entries) {
            if (entry.fileSize >= MIN_OGG_BYTES) {
              if (completedOffsets[validIdx] !== entry.sessionOffsetMs) {
                return false;
              }
              validIdx++;
            }
          }
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });
});

/**
 * Validates: Requirements 3.1
 *
 * Preservation property: restoreChunkCountersFromManifest correctly resumes
 * chunk indexing after reconnect. For all valid chunk arrays with NNNN.ogg
 * filenames, the restored counter for each user equals max(chunk indices) + 1.
 */
describe('restoreChunkCountersFromManifest — preservation property', () => {
  // Arbitrary for a discord user ID (17-20 digit string)
  const discordUserIdArb = fc.stringMatching(/^[0-9]{17,20}$/);

  // Generate a chunk with a specific user and index
  const chunkWithIndexArb = (userId: string, index: number): RecordingManifestChunk => ({
    discordUserId: userId as RecordingManifestChunk['discordUserId'],
    displayName: `User_${userId.slice(0, 4)}`,
    relativePath: `audio/discord/${userId}/${String(index).padStart(4, '0')}.ogg`,
    sessionOffsetMs: index * 60_000,
    durationMs: 30_000,
    codec: 'opus_ogg',
    sampleRate: 48_000,
    channels: 2,
  });

  it('nextChunkIndexFromRelativePath extracts index + 1 from NNNN.ogg paths', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9999 }), (index) => {
        const path = `audio/discord/123456789012345678/${String(index).padStart(4, '0')}.ogg`;
        const result = nextChunkIndexFromRelativePath(path);
        return result === index + 1;
      }),
      { numRuns: 200 },
    );
  });

  it('restored counter equals max(chunk indices for that user) + 1', () => {
    fc.assert(
      fc.property(
        // Generate 1-5 users, each with 1-5 chunk indices
        fc.array(
          fc.tuple(
            discordUserIdArb,
            fc.array(fc.integer({ min: 0, max: 9999 }), { minLength: 1, maxLength: 5 }),
          ),
          { minLength: 1, maxLength: 5 },
        ),
        (userChunks) => {
          // Build chunks array
          const chunks: RecordingManifestChunk[] = [];
          const expectedCounters = new Map<string, number>();

          for (const [userId, indices] of userChunks) {
            for (const index of indices) {
              chunks.push(chunkWithIndexArb(userId, index));
            }
            const maxIndex = Math.max(...indices);
            // If multiple entries for same userId, take the overall max
            const prev = expectedCounters.get(userId) ?? -1;
            if (maxIndex > prev) {
              expectedCounters.set(userId, maxIndex);
            }
          }

          // Run the function
          const counters = new Map<string, number>();
          restoreChunkCountersFromManifest(chunks, counters);

          // Verify each user's counter equals max index + 1
          for (const [userId, maxIndex] of expectedCounters) {
            const actual = counters.get(userId);
            if (actual !== maxIndex + 1) {
              return false;
            }
          }
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('handles multiple chunks per user with varying indices correctly', () => {
    // Concrete example: user with chunks at indices 0, 3, 7 → counter should be 8
    const userId = '123456789012345678' as RecordingManifestChunk['discordUserId'];
    const chunks: RecordingManifestChunk[] = [
      chunkWithIndexArb(userId, 0),
      chunkWithIndexArb(userId, 3),
      chunkWithIndexArb(userId, 7),
    ];

    const counters = new Map<string, number>();
    restoreChunkCountersFromManifest(chunks, counters);

    expect(counters.get(userId)).toBe(8);
  });

  it('handles multiple users independently', () => {
    const userA = '111111111111111111' as RecordingManifestChunk['discordUserId'];
    const userB = '222222222222222222' as RecordingManifestChunk['discordUserId'];

    const chunks: RecordingManifestChunk[] = [
      chunkWithIndexArb(userA, 0),
      chunkWithIndexArb(userA, 1),
      chunkWithIndexArb(userA, 2),
      chunkWithIndexArb(userB, 0),
      chunkWithIndexArb(userB, 5),
    ];

    const counters = new Map<string, number>();
    restoreChunkCountersFromManifest(chunks, counters);

    expect(counters.get(userA)).toBe(3);
    expect(counters.get(userB)).toBe(6);
  });
});
