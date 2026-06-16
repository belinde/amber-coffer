import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';

/** Default silence threshold in dBFS. Chunks below this are considered silent. */
const DEFAULT_SILENCE_THRESHOLD_DBFS = -50;

export type ValidationResult =
  | { status: 'valid'; meanVolume: number }
  | { status: 'silent'; meanVolume: number }
  | { status: 'error'; reason: string };

/**
 * Regex to extract mean_volume from ffmpeg volumedetect output.
 * Example line: `mean_volume: -34.2 dB`
 */
const MEAN_VOLUME_REGEX = /mean_volume:\s*([-\d.]+)\s*dB/;

/**
 * Pure decision function: classifies a mean volume value as 'valid' or 'silent'
 * based on a threshold. Returns 'silent' iff meanVolume < threshold.
 */
export function classifyVolume(meanVolume: number, threshold: number): 'valid' | 'silent' {
  return meanVolume < threshold ? 'silent' : 'valid';
}

/**
 * Validates a finalized audio chunk by checking for silence via ffmpeg volumedetect.
 *
 * - Zero-byte files are immediately classified as silent (no ffmpeg spawn).
 * - If ffmpeg fails, the chunk is treated as valid (requirement 4.5).
 * - Otherwise, mean_volume is compared against the threshold.
 */
export async function validateChunk(
  filePath: string,
  silenceThresholdDbfs: number = DEFAULT_SILENCE_THRESHOLD_DBFS,
): Promise<ValidationResult> {
  // Check file size first — zero-byte files are silent without running ffmpeg
  const fileStats = await stat(filePath).catch(() => null);
  if (!fileStats || fileStats.size === 0) {
    return { status: 'silent', meanVolume: -Infinity };
  }

  // Spawn ffmpeg volumedetect and parse stderr
  const stderr = await runFfmpegVolumeDetect(filePath);

  if (stderr === null) {
    // ffmpeg failed — treat as valid per requirement 4.5
    return { status: 'error', reason: 'ffmpeg volumedetect failed' };
  }

  const meanVolume = parseMeanVolume(stderr);

  if (meanVolume === null) {
    // Could not parse mean_volume — treat as error (still valid for pipeline)
    return { status: 'error', reason: 'could not parse mean_volume from ffmpeg output' };
  }

  const status = classifyVolume(meanVolume, silenceThresholdDbfs);
  return { status, meanVolume };
}

/**
 * Runs ffmpeg volumedetect on a file and returns the stderr output.
 * Returns `null` if ffmpeg fails to execute.
 */
function runFfmpegVolumeDetect(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'ffmpeg',
      ['-i', filePath, '-af', 'volumedetect', '-f', 'null', '/dev/null'],
      { encoding: 'utf-8' },
      (error, _stdout, stderr) => {
        // ffmpeg writes volumedetect stats to stderr even on success (exit 0).
        // If there's stderr content, use it regardless of error code —
        // volumedetect may still have produced output before a non-zero exit.
        if (stderr && stderr.length > 0) {
          resolve(stderr);
        } else if (error) {
          resolve(null);
        } else {
          resolve(stderr ?? null);
        }
      },
    );
  });
}

/**
 * Extracts the mean_volume value (dBFS) from ffmpeg volumedetect stderr output.
 */
export function parseMeanVolume(stderr: string): number | null {
  const match = MEAN_VOLUME_REGEX.exec(stderr);
  if (!match || match[1] === undefined) return null;
  const value = parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}
