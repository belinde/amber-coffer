import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseMeanVolume, validateChunk } from '../src/chunk-validator.js';

describe('chunk-validator', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `chunk-validator-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('parseMeanVolume', () => {
    it('extracts mean_volume from typical ffmpeg volumedetect output', () => {
      const stderr = `[Parsed_volumedetect_0 @ 0x5555555] n_samples: 48000
[Parsed_volumedetect_0 @ 0x5555555] mean_volume: -34.2 dB
[Parsed_volumedetect_0 @ 0x5555555] max_volume: -12.1 dB`;

      expect(parseMeanVolume(stderr)).toBe(-34.2);
    });

    it('extracts negative integer mean_volume', () => {
      const stderr = `mean_volume: -50 dB`;
      expect(parseMeanVolume(stderr)).toBe(-50);
    });

    it('extracts zero mean_volume', () => {
      const stderr = `mean_volume: 0.0 dB`;
      expect(parseMeanVolume(stderr)).toBe(0);
    });

    it('extracts very low mean_volume (near silence)', () => {
      const stderr = `mean_volume: -91.0 dB`;
      expect(parseMeanVolume(stderr)).toBe(-91.0);
    });

    it('returns null when mean_volume line is absent', () => {
      const stderr = `[Parsed_volumedetect_0 @ 0x5555555] max_volume: -12.1 dB`;
      expect(parseMeanVolume(stderr)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseMeanVolume('')).toBeNull();
    });

    it('returns null for malformed value', () => {
      const stderr = `mean_volume: not_a_number dB`;
      expect(parseMeanVolume(stderr)).toBeNull();
    });
  });

  describe('validateChunk — zero-byte file detection', () => {
    it('returns silent with -Infinity for a zero-byte file', async () => {
      const filePath = join(testDir, 'empty.wav');
      writeFileSync(filePath, '');

      const result = await validateChunk(filePath);

      expect(result.status).toBe('silent');
      expect(result).toEqual({ status: 'silent', meanVolume: -Infinity });
    });

    it('returns silent with -Infinity for a non-existent file', async () => {
      const filePath = join(testDir, 'does-not-exist.wav');

      const result = await validateChunk(filePath);

      expect(result).toEqual({ status: 'silent', meanVolume: -Infinity });
    });
  });

  describe('validateChunk — ffmpeg failure fallback', () => {
    it('returns error status when ffmpeg cannot process the file', async () => {
      const filePath = join(testDir, 'not-audio.wav');
      // Write non-audio content that ffmpeg cannot decode
      await writeFile(filePath, 'This is not a valid audio file at all.');

      const result = await validateChunk(filePath);

      // Per requirement 4.5: if ffmpeg fails, treat as error (but still valid for pipeline)
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.reason).toBeDefined();
      }
    });
  });

  describe('validateChunk — silent chunk detection', () => {
    it('classifies a chunk as silent when mean_volume is below threshold', async () => {
      // This test requires ffmpeg installed. We generate a minimal silent WAV.
      const filePath = join(testDir, 'silent.wav');

      // Create a valid WAV file with silence (all zeros)
      const sampleRate = 48000;
      const channels = 1;
      const bitsPerSample = 16;
      const durationSamples = 4800; // 100ms of silence
      const dataSize = durationSamples * channels * (bitsPerSample / 8);

      const header = Buffer.alloc(44);
      header.write('RIFF', 0);
      header.writeUInt32LE(36 + dataSize, 4);
      header.write('WAVE', 8);
      header.write('fmt ', 12);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20); // PCM
      header.writeUInt16LE(channels, 22);
      header.writeUInt32LE(sampleRate, 24);
      header.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
      header.writeUInt16LE(channels * (bitsPerSample / 8), 32);
      header.writeUInt16LE(bitsPerSample, 34);
      header.write('data', 36);
      header.writeUInt32LE(dataSize, 40);

      const silence = Buffer.alloc(dataSize, 0);
      await writeFile(filePath, Buffer.concat([header, silence]));

      const result = await validateChunk(filePath, -50);

      // A fully silent WAV produces -inf or very low dBFS — classified as silent
      expect(result.status).toBe('silent');
    });
  });
});
