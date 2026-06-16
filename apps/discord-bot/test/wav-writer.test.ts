import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WavWriter } from '../src/wav-writer.js';

const WAV_HEADER_SIZE = 44;

describe('WavWriter', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `wav-writer-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  function wavPath(name = 'test.wav'): string {
    return join(testDir, name);
  }

  describe('WAV header generation', () => {
    it('writes correct RIFF magic bytes', async () => {
      const path = wavPath();
      const writer = new WavWriter(path, 48000, 1, 16);
      // Write enough data to exceed MIN_WAV_BYTES threshold
      writer.write(Buffer.alloc(512));
      await writer.finalize();

      const buf = readFileSync(path);
      expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(buf.subarray(8, 12).toString('ascii')).toBe('WAVE');
    });

    it('writes correct fmt chunk', async () => {
      const path = wavPath();
      const writer = new WavWriter(path, 48000, 1, 16);
      writer.write(Buffer.alloc(512));
      await writer.finalize();

      const buf = readFileSync(path);
      // fmt chunk ID at offset 12
      expect(buf.subarray(12, 16).toString('ascii')).toBe('fmt ');
      // fmt chunk size = 16 (PCM)
      expect(buf.readUInt32LE(16)).toBe(16);
    });

    it('writes PCM format tag (audioFormat = 1)', async () => {
      const path = wavPath();
      const writer = new WavWriter(path, 48000, 1, 16);
      writer.write(Buffer.alloc(512));
      await writer.finalize();

      const buf = readFileSync(path);
      // Audio format at offset 20
      expect(buf.readUInt16LE(20)).toBe(1);
    });

    it('writes correct sample rate', async () => {
      const path = wavPath();
      const writer = new WavWriter(path, 48000, 1, 16);
      writer.write(Buffer.alloc(512));
      await writer.finalize();

      const buf = readFileSync(path);
      // Sample rate at offset 24
      expect(buf.readUInt32LE(24)).toBe(48000);
    });

    it('writes correct bit depth', async () => {
      const path = wavPath();
      const writer = new WavWriter(path, 48000, 1, 16);
      writer.write(Buffer.alloc(512));
      await writer.finalize();

      const buf = readFileSync(path);
      // Bits per sample at offset 34
      expect(buf.readUInt16LE(34)).toBe(16);
    });

    it('writes correct channel count', async () => {
      const path = wavPath();
      const writer = new WavWriter(path, 48000, 2, 16);
      writer.write(Buffer.alloc(512));
      await writer.finalize();

      const buf = readFileSync(path);
      // Channels at offset 22
      expect(buf.readUInt16LE(22)).toBe(2);
    });

    it('writes correct byte rate and block align', async () => {
      const sampleRate = 48000;
      const channels = 1;
      const bitsPerSample = 16;
      const path = wavPath();
      const writer = new WavWriter(path, sampleRate, channels, bitsPerSample);
      writer.write(Buffer.alloc(512));
      await writer.finalize();

      const buf = readFileSync(path);
      const expectedByteRate = sampleRate * channels * (bitsPerSample / 8);
      const expectedBlockAlign = channels * (bitsPerSample / 8);

      // Byte rate at offset 28
      expect(buf.readUInt32LE(28)).toBe(expectedByteRate);
      // Block align at offset 32
      expect(buf.readUInt16LE(32)).toBe(expectedBlockAlign);
    });

    it('writes data chunk marker', async () => {
      const path = wavPath();
      const writer = new WavWriter(path, 48000, 1, 16);
      writer.write(Buffer.alloc(512));
      await writer.finalize();

      const buf = readFileSync(path);
      // data chunk ID at offset 36
      expect(buf.subarray(36, 40).toString('ascii')).toBe('data');
    });
  });

  describe('finalize', () => {
    it('updates RIFF file size correctly', async () => {
      const path = wavPath();
      const writer = new WavWriter(path, 48000, 1, 16);
      const pcmData = Buffer.alloc(1024);
      writer.write(pcmData);
      await writer.finalize();

      const buf = readFileSync(path);
      // RIFF size at offset 4 = total file size - 8
      const expectedRiffSize = WAV_HEADER_SIZE - 8 + pcmData.length;
      expect(buf.readUInt32LE(4)).toBe(expectedRiffSize);
    });

    it('updates data chunk size correctly', async () => {
      const path = wavPath();
      const writer = new WavWriter(path, 48000, 1, 16);
      const pcmData = Buffer.alloc(1024);
      writer.write(pcmData);
      await writer.finalize();

      const buf = readFileSync(path);
      // data size at offset 40
      expect(buf.readUInt32LE(40)).toBe(pcmData.length);
    });

    it('returns total bytes written', async () => {
      const path = wavPath();
      const writer = new WavWriter(path, 48000, 1, 16);
      const pcmData = Buffer.alloc(1024);
      writer.write(pcmData);
      const result = await writer.finalize();

      expect(result.bytesWritten).toBe(WAV_HEADER_SIZE + pcmData.length);
    });

    it('returns 0 if already closed', async () => {
      const path = wavPath();
      const writer = new WavWriter(path, 48000, 1, 16);
      writer.write(Buffer.alloc(1024));
      await writer.finalize();

      const result = await writer.finalize();
      expect(result.bytesWritten).toBe(0);
    });
  });

  describe('abort', () => {
    it('deletes the incomplete file', async () => {
      const path = wavPath();
      const writer = new WavWriter(path, 48000, 1, 16);
      writer.write(Buffer.alloc(100));

      expect(existsSync(path)).toBe(true);
      await writer.abort();
      expect(existsSync(path)).toBe(false);
    });

    it('does not throw if called multiple times', async () => {
      const path = wavPath();
      const writer = new WavWriter(path, 48000, 1, 16);
      await writer.abort();
      await expect(writer.abort()).resolves.toBeUndefined();
    });
  });

  describe('minimum 512-byte threshold', () => {
    it('deletes file and returns 0 when finalized below 512 bytes', async () => {
      const path = wavPath();
      const writer = new WavWriter(path, 48000, 1, 16);
      // Write very little data: 44 header + small payload < 512
      writer.write(Buffer.alloc(100));
      const result = await writer.finalize();

      expect(result.bytesWritten).toBe(0);
      expect(existsSync(path)).toBe(false);
    });

    it('keeps file when finalized at or above 512 bytes', async () => {
      const path = wavPath();
      const writer = new WavWriter(path, 48000, 1, 16);
      // 44 header + 468 data = 512 exactly
      writer.write(Buffer.alloc(468));
      const result = await writer.finalize();

      expect(result.bytesWritten).toBe(512);
      expect(existsSync(path)).toBe(true);
    });
  });

  describe('I/O error handling', () => {
    it('throws when writing after abort', async () => {
      const path = wavPath();
      const writer = new WavWriter(path, 48000, 1, 16);
      await writer.abort();

      expect(() => writer.write(Buffer.alloc(100))).toThrow('Cannot write to a closed WavWriter');
    });

    it('throws when writing after finalize', async () => {
      const path = wavPath();
      const writer = new WavWriter(path, 48000, 1, 16);
      writer.write(Buffer.alloc(1024));
      await writer.finalize();

      expect(() => writer.write(Buffer.alloc(100))).toThrow('Cannot write to a closed WavWriter');
    });
  });
});
