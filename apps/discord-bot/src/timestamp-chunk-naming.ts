import { join } from 'node:path';

/**
 * Generates a WAV chunk filename from a Unix epoch timestamp.
 * First chunk at a given second has no suffix; subsequent collisions
 * get an `_N` suffix starting at 1.
 */
export function timestampChunkFileName(epochSeconds: number, collisionIndex?: number): string {
  if (collisionIndex === undefined || collisionIndex === 0) {
    return `${epochSeconds}.wav`;
  }
  return `${epochSeconds}_${collisionIndex}.wav`;
}

/**
 * Returns the directory path where chunks for a given Discord user are stored.
 * Pattern: `{sessionDir}/audio/discord/{discordUserId}/`
 */
export function chunkDirectoryPath(sessionDir: string, discordUserId: string): string {
  return join(sessionDir, 'audio', 'discord', discordUserId) + '/';
}

/**
 * Parsed result of a chunk filename.
 */
export type ParsedChunkFilename = {
  timestamp: number;
  collisionIndex: number | null;
};

const CHUNK_FILENAME_REGEX = /^(\d+)(?:_(\d+))?\.wav$/;

/**
 * Parses a chunk filename back into its constituent timestamp and collision index.
 * Returns `null` for collisionIndex when the filename has no collision suffix (first chunk).
 */
export function parseChunkFilename(filename: string): ParsedChunkFilename | null {
  const match = CHUNK_FILENAME_REGEX.exec(filename);
  if (!match) return null;

  const timestamp = Number(match[1]);
  const collisionPart = match[2];
  const collisionIndex = collisionPart !== undefined ? Number(collisionPart) : null;

  return { timestamp, collisionIndex };
}

/**
 * Tracks per-user timestamp collisions so that multiple chunks
 * starting within the same second get unique filenames.
 */
export class CollisionTracker {
  private readonly state = new Map<string, { lastTimestamp: number; counter: number }>();

  /**
   * Returns the next collision index for a user at the given epoch second.
   * Returns 0 for the first chunk at a new timestamp, increments for subsequent ones.
   */
  nextIndex(discordUserId: string, epochSeconds: number): number {
    const entry = this.state.get(discordUserId);

    if (!entry || entry.lastTimestamp !== epochSeconds) {
      this.state.set(discordUserId, { lastTimestamp: epochSeconds, counter: 0 });
      return 0;
    }

    entry.counter += 1;
    return entry.counter;
  }

  /** Resets all tracked state. */
  clear(): void {
    this.state.clear();
  }
}
