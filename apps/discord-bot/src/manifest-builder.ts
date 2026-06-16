import type { RecordingManifestChunk } from '@amber/shared';

export interface ChunkInput {
  discordUserId: string;
  displayName: string;
  relativePath: string;
  /** Wall-clock time when the chunk recording started (ms since epoch). */
  startTime: number;
  /** Wall-clock time when the chunk recording ended (ms since epoch). */
  endTime: number;
  /** Wall-clock time when the overall session started (ms since epoch). */
  sessionStartTime: number;
}

/**
 * Collects chunk metadata during recording and produces the final
 * `chunks` array for a V2 recording manifest.
 */
export class ManifestBuilder {
  private readonly newChunks: RecordingManifestChunk[] = [];
  private existingChunks: RecordingManifestChunk[] = [];

  /** Add a newly-recorded chunk, computing offset and duration from wall-clock times. */
  addChunk(chunk: ChunkInput): void {
    const sessionOffsetMs = Math.max(0, chunk.startTime - chunk.sessionStartTime);
    const durationMs = Math.max(0, chunk.endTime - chunk.startTime);

    this.newChunks.push({
      discordUserId: chunk.discordUserId,
      displayName: chunk.displayName,
      relativePath: chunk.relativePath,
      sessionOffsetMs,
      durationMs,
      codec: 'pcm_wav',
      sampleRate: 48_000,
      channels: 1,
    } as RecordingManifestChunk);
  }

  /** Prepend existing chunks from a prior manifest (unchanged). */
  mergeExisting(existingChunks: RecordingManifestChunk[]): void {
    this.existingChunks = [...existingChunks];
  }

  /** Build the final chunks array: existing first, then new. */
  build(): RecordingManifestChunk[] {
    return [...this.existingChunks, ...this.newChunks];
  }
}
