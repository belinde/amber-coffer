import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  chunkDirectoryPath,
  parseChunkFilename,
  timestampChunkFileName,
} from '../src/timestamp-chunk-naming.js';

// Feature: session-recording-live-transcription, Property 1: Timestamp filename generation
/**
 * Validates: Requirements 1.1, 1.2
 *
 * For any positive integer timestamp, calling the chunk filename generator
 * with collision index 0 produces `{timestamp}.wav` with no suffix,
 * and the timestamp in the filename equals the input timestamp.
 */
describe('Property 1: Timestamp filename generation', () => {
  it('index 0 produces {timestamp}.wav for any positive integer timestamp', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2_147_483_647 }), (timestamp) => {
        const filename = timestampChunkFileName(timestamp, 0);
        expect(filename).toBe(`${timestamp}.wav`);
      }),
      { numRuns: 100 },
    );
  });

  it('undefined collision index also produces {timestamp}.wav', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2_147_483_647 }), (timestamp) => {
        const filename = timestampChunkFileName(timestamp, undefined);
        expect(filename).toBe(`${timestamp}.wav`);
      }),
      { numRuns: 100 },
    );
  });

  it('filename matches pattern /^\\d+\\.wav$/ with no underscore suffix', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2_147_483_647 }), (timestamp) => {
        const filename = timestampChunkFileName(timestamp, 0);
        expect(filename).toMatch(/^\d+\.wav$/);
        expect(filename).not.toContain('_');
      }),
      { numRuns: 100 },
    );
  });

  it('parsing the generated filename recovers the original timestamp with null collision index', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2_147_483_647 }), (timestamp) => {
        const filename = timestampChunkFileName(timestamp, 0);
        const parsed = parseChunkFilename(filename);
        expect(parsed).not.toBeNull();
        expect(parsed!.timestamp).toBe(timestamp);
        expect(parsed!.collisionIndex).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: session-recording-live-transcription, Property 2: Timestamp collision suffix
/**
 * Validates: Requirements 1.3
 *
 * For any valid Unix epoch timestamp and any collision index N >= 1,
 * calling the chunk filename generator produces `{timestamp}_{N}.wav`,
 * and parsing the filename back recovers both the original timestamp
 * and the collision index.
 */
describe('Property 2: Timestamp collision suffix', () => {
  it('index N >= 1 produces {timestamp}_{N}.wav', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2_147_483_647 }),
        fc.integer({ min: 1, max: 1000 }),
        (timestamp, collisionIndex) => {
          const filename = timestampChunkFileName(timestamp, collisionIndex);
          expect(filename).toBe(`${timestamp}_${collisionIndex}.wav`);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('parsing recovers both timestamp and collision index', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2_147_483_647 }),
        fc.integer({ min: 1, max: 1000 }),
        (timestamp, collisionIndex) => {
          const filename = timestampChunkFileName(timestamp, collisionIndex);
          const parsed = parseChunkFilename(filename);
          expect(parsed).not.toBeNull();
          expect(parsed!.timestamp).toBe(timestamp);
          expect(parsed!.collisionIndex).toBe(collisionIndex);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('filename matches pattern /^\\d+_\\d+\\.wav$/', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2_147_483_647 }),
        fc.integer({ min: 1, max: 1000 }),
        (timestamp, collisionIndex) => {
          const filename = timestampChunkFileName(timestamp, collisionIndex);
          expect(filename).toMatch(/^\d+_\d+\.wav$/);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: session-recording-live-transcription, Property 3: Chunk directory path construction
/**
 * Validates: Requirements 1.4
 *
 * For any session directory path and any valid Discord user ID string,
 * the chunk directory path function produces a path ending with
 * `audio/discord/{discordUserId}/`.
 */
describe('Property 3: Chunk directory path construction', () => {
  // Discord user IDs are 17-20 digit numeric strings
  const discordUserIdArb = fc.stringMatching(/^[0-9]{17,20}$/);

  // Session dirs are absolute or relative paths without trailing slash
  const sessionDirArb = fc.oneof(
    fc.constant('/tmp/sessions/42'),
    fc.constant('/home/user/amber/sessions/7'),
    fc.constant('sessions/123'),
    fc.stringMatching(/^\/[a-z]{1,10}(\/[a-z0-9]{1,10}){1,4}$/),
  );

  it('path ends with audio/discord/{discordUserId}/', () => {
    fc.assert(
      fc.property(sessionDirArb, discordUserIdArb, (sessionDir, userId) => {
        const dirPath = chunkDirectoryPath(sessionDir, userId);
        expect(dirPath).toMatch(new RegExp(`audio/discord/${userId}/$`));
      }),
      { numRuns: 100 },
    );
  });

  it('path starts with the session directory', () => {
    fc.assert(
      fc.property(sessionDirArb, discordUserIdArb, (sessionDir, userId) => {
        const dirPath = chunkDirectoryPath(sessionDir, userId);
        expect(dirPath.startsWith(sessionDir)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('path contains the expected intermediate segments', () => {
    fc.assert(
      fc.property(sessionDirArb, discordUserIdArb, (sessionDir, userId) => {
        const dirPath = chunkDirectoryPath(sessionDir, userId);
        expect(dirPath).toContain('/audio/discord/');
        expect(dirPath).toContain(userId);
      }),
      { numRuns: 100 },
    );
  });
});
