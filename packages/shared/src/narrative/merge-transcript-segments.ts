import type { WhisperSegment } from './whisper-sidecar.schema.js';

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Merges STT segments chronologically into POC-style raw transcript lines.
 */
export function mergeTranscriptSegments(segments: WhisperSegment[]): string {
  const sorted = [...segments].sort((a, b) => a.start - b.start || a.end - b.end);
  return sorted
    .map((seg) => `[${formatTimestamp(seg.start)}] ${seg.speaker}: ${seg.text.trim()}`)
    .filter((line) => line.length > 0)
    .join('\n');
}
