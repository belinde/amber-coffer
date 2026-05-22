import type { RecordingManifestChunk } from '@amber/shared';

/** ffmpeg may leave a tiny invalid Ogg shell when a speaking segment had no decoded audio. */
export const MIN_OGG_BYTES = 256;

export function chunkFileName(index: number): string {
  return `${String(index).padStart(4, '0')}.ogg`;
}

export function nextChunkIndexFromRelativePath(relativePath: string): number | null {
  const match = /\/(\d{4})\.ogg$/.exec(relativePath);
  const indexPart = match?.[1];
  if (!indexPart) return null;
  return Number.parseInt(indexPart, 10) + 1;
}

export function restoreChunkCountersFromManifest(
  chunks: RecordingManifestChunk[],
  chunkCounters: Map<string, number>,
): void {
  for (const chunk of chunks) {
    const nextIndex = nextChunkIndexFromRelativePath(chunk.relativePath);
    if (nextIndex === null) continue;
    const prev = chunkCounters.get(chunk.discordUserId) ?? 0;
    if (nextIndex > prev) {
      chunkCounters.set(chunk.discordUserId, nextIndex);
    }
  }
}
