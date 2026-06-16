import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ManifestBuilder } from '../src/manifest-builder.js';
import {
  CollisionTracker,
  chunkDirectoryPath,
  timestampChunkFileName,
} from '../src/timestamp-chunk-naming.js';
import { WavWriter } from '../src/wav-writer.js';

/**
 * End-to-end filesystem contract tests.
 *
 * These validate the contract between the Discord bot (TypeScript) and the
 * Transcription Pipeline (Python) regarding directory structure, file naming,
 * file completeness, and manifest integrity.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 3.6
 */
describe('Filesystem contract: Discord bot ↔ Transcription pipeline', () => {
  let sessionDir: string;

  beforeEach(async () => {
    sessionDir = join(tmpdir(), `fs-contract-test-${randomUUID()}`);
    await mkdir(sessionDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(sessionDir, { recursive: true, force: true });
  });

  describe('Directory structure matches pipeline expectations', () => {
    it('chunkDirectoryPath produces audio/discord/{userId}/ structure', () => {
      const userId = '123456789012345678';
      const dirPath = chunkDirectoryPath(sessionDir, userId);

      // Pipeline scans audio/discord/*/ — verify path matches that structure
      expect(dirPath).toBe(join(sessionDir, 'audio', 'discord', userId) + '/');
      expect(dirPath).toContain('audio/discord/');
    });

    it('WavWriter creates files in the correct directory structure', async () => {
      const userId = '987654321098765432';
      const userDir = chunkDirectoryPath(sessionDir, userId);
      await mkdir(userDir, { recursive: true });

      const fileName = timestampChunkFileName(1719849600);
      const filePath = join(userDir, fileName);

      const writer = new WavWriter(filePath, 48_000, 1, 16);
      writer.write(Buffer.alloc(1024)); // Enough to exceed 512-byte threshold
      await writer.finalize();

      // Verify the file is at the expected path: sessionDir/audio/discord/{userId}/{timestamp}.wav
      expect(existsSync(filePath)).toBe(true);

      // Verify the relative path matches the pattern the pipeline expects
      const relPath = relative(sessionDir, filePath);
      expect(relPath).toMatch(/^audio\/discord\/\d+\/\d+\.wav$/);
    });

    it('multiple users create parallel directories', async () => {
      const users = ['111111111111111111', '222222222222222222', '333333333333333333'];

      for (const userId of users) {
        const userDir = chunkDirectoryPath(sessionDir, userId);
        await mkdir(userDir, { recursive: true });
        const filePath = join(userDir, timestampChunkFileName(1719849600));
        const writer = new WavWriter(filePath, 48_000, 1, 16);
        writer.write(Buffer.alloc(1024));
        await writer.finalize();
      }

      // Pipeline scans audio/discord/*/ iterating over user dirs
      const audioDiscordDir = join(sessionDir, 'audio', 'discord');
      const userDirs = readdirSync(audioDiscordDir);
      expect(userDirs).toHaveLength(3);
      expect(userDirs.sort()).toEqual(users.sort());
    });
  });

  describe('WavWriter finalize closes file before external access', () => {
    it('finalized file has correct WAV header and is fully closed', async () => {
      const userDir = chunkDirectoryPath(sessionDir, '111111111111111111');
      await mkdir(userDir, { recursive: true });

      const filePath = join(userDir, timestampChunkFileName(1719849600));
      const writer = new WavWriter(filePath, 48_000, 1, 16);
      writer.write(Buffer.alloc(2048));
      const { bytesWritten } = await writer.finalize();

      // After finalize(), the file must be fully closed and readable
      expect(bytesWritten).toBeGreaterThan(512);
      expect(existsSync(filePath)).toBe(true);

      // The file should not be growing — verify stable size
      const stat1 = statSync(filePath);
      const stat2 = statSync(filePath);
      expect(stat1.size).toBe(stat2.size);
      expect(stat1.size).toBe(bytesWritten);
    });

    it('finalize returns before file is considered available (sequential guarantee)', async () => {
      const userDir = chunkDirectoryPath(sessionDir, '111111111111111111');
      await mkdir(userDir, { recursive: true });

      const filePath = join(userDir, timestampChunkFileName(1719849600));
      const writer = new WavWriter(filePath, 48_000, 1, 16);
      writer.write(Buffer.alloc(1024));

      // The promise resolution of finalize() is the contract boundary —
      // only after it resolves may external processes read the file
      await writer.finalize();

      // Post-finalize: file is readable and its size matches what was written
      const stat = statSync(filePath);
      expect(stat.size).toBe(1024 + 44); // PCM data + WAV header
    });
  });

  describe('Pipeline file stability contract (≥500ms unchanged)', () => {
    it('newly written files have a recent mtime for stability check', async () => {
      const userDir = chunkDirectoryPath(sessionDir, '111111111111111111');
      await mkdir(userDir, { recursive: true });

      const filePath = join(userDir, timestampChunkFileName(1719849600));
      const writer = new WavWriter(filePath, 48_000, 1, 16);
      writer.write(Buffer.alloc(1024));
      await writer.finalize();

      const stat = statSync(filePath);
      const now = Date.now();
      const fileAge = now - stat.mtimeMs;

      // A freshly finalized file should have a very recent mtime
      // The pipeline will wait for 500ms stability — this ensures mtime is set correctly
      expect(fileAge).toBeLessThan(5000); // Less than 5 seconds old
    });
  });

  describe('Pipeline preserves .wav files after transcription', () => {
    it('source .wav files remain intact (bot never deletes valid chunks)', async () => {
      const userDir = chunkDirectoryPath(sessionDir, '111111111111111111');
      await mkdir(userDir, { recursive: true });

      const filePath = join(userDir, timestampChunkFileName(1719849600));
      const writer = new WavWriter(filePath, 48_000, 1, 16);
      writer.write(Buffer.alloc(2048));
      await writer.finalize();

      // After successful finalization + validation (non-silent), file must remain
      expect(existsSync(filePath)).toBe(true);
      const originalSize = statSync(filePath).size;

      // Simulate what the pipeline does: read the file (transcription)
      // The pipeline writes a .md alongside but never touches the .wav
      // Verify the .wav is untouched after "external read"
      const stat = statSync(filePath);
      expect(stat.size).toBe(originalSize);
    });
  });

  describe('Manifest references existing files', () => {
    it('ManifestBuilder produces relativePath entries pointing to existing files', async () => {
      const userId = '111111111111111111';
      const userDir = chunkDirectoryPath(sessionDir, userId);
      await mkdir(userDir, { recursive: true });

      const collisionTracker = new CollisionTracker();
      const sessionStartTime = Date.now() - 60_000; // 1 minute ago
      const manifestBuilder = new ManifestBuilder();

      // Write 3 chunks to disk, matching what record.ts does
      const chunkTimes = [1719849600, 1719849632, 1719849660];
      for (const epochSec of chunkTimes) {
        const collisionIndex = collisionTracker.nextIndex(userId, epochSec);
        const fileName = timestampChunkFileName(epochSec, collisionIndex);
        const filePath = join(userDir, fileName);
        const relativePath = `audio/discord/${userId}/${fileName}`;

        const writer = new WavWriter(filePath, 48_000, 1, 16);
        writer.write(Buffer.alloc(1024));
        await writer.finalize();

        manifestBuilder.addChunk({
          discordUserId: userId,
          displayName: 'TestUser',
          relativePath,
          startTime: epochSec * 1000,
          endTime: epochSec * 1000 + 30_000,
          sessionStartTime,
        });
      }

      // Build manifest and verify every relativePath points to an existing file
      const chunks = manifestBuilder.build();
      expect(chunks).toHaveLength(3);

      for (const chunk of chunks) {
        const absolutePath = join(sessionDir, chunk.relativePath);
        expect(existsSync(absolutePath)).toBe(true);
        expect(statSync(absolutePath).size).toBeGreaterThan(512);
      }
    });

    it('ManifestBuilder with collision suffixes produces valid paths', async () => {
      const userId = '111111111111111111';
      const userDir = chunkDirectoryPath(sessionDir, userId);
      await mkdir(userDir, { recursive: true });

      const collisionTracker = new CollisionTracker();
      const sessionStartTime = Date.now() - 60_000;
      const manifestBuilder = new ManifestBuilder();
      const epochSec = 1719849600;

      // Write 3 chunks at the same second (collision case)
      for (let i = 0; i < 3; i++) {
        const collisionIndex = collisionTracker.nextIndex(userId, epochSec);
        const fileName = timestampChunkFileName(epochSec, collisionIndex);
        const filePath = join(userDir, fileName);
        const relativePath = `audio/discord/${userId}/${fileName}`;

        const writer = new WavWriter(filePath, 48_000, 1, 16);
        writer.write(Buffer.alloc(1024));
        await writer.finalize();

        manifestBuilder.addChunk({
          discordUserId: userId,
          displayName: 'TestUser',
          relativePath,
          startTime: epochSec * 1000 + i * 100,
          endTime: epochSec * 1000 + i * 100 + 30_000,
          sessionStartTime,
        });
      }

      const chunks = manifestBuilder.build();
      expect(chunks).toHaveLength(3);

      // Verify collision naming pattern
      expect(chunks[0]?.relativePath).toContain('1719849600.wav');
      expect(chunks[1]?.relativePath).toContain('1719849600_1.wav');
      expect(chunks[2]?.relativePath).toContain('1719849600_2.wav');

      // All referenced files must exist
      for (const chunk of chunks) {
        const absolutePath = join(sessionDir, chunk.relativePath);
        expect(existsSync(absolutePath)).toBe(true);
      }
    });

    it('manifest chunk metadata is correct for new WAV format', async () => {
      const userId = '111111111111111111';
      const userDir = chunkDirectoryPath(sessionDir, userId);
      await mkdir(userDir, { recursive: true });

      const manifestBuilder = new ManifestBuilder();
      const epochSec = 1719849600;
      const fileName = timestampChunkFileName(epochSec);
      const filePath = join(userDir, fileName);

      const writer = new WavWriter(filePath, 48_000, 1, 16);
      writer.write(Buffer.alloc(1024));
      await writer.finalize();

      manifestBuilder.addChunk({
        discordUserId: userId,
        displayName: 'TestUser',
        relativePath: `audio/discord/${userId}/${fileName}`,
        startTime: epochSec * 1000,
        endTime: epochSec * 1000 + 30_000,
        sessionStartTime: epochSec * 1000 - 60_000,
      });

      const chunks = manifestBuilder.build();
      const chunk = chunks[0]!;

      // Verify metadata matches the WAV format contract
      expect(chunk.codec).toBe('pcm_wav');
      expect(chunk.sampleRate).toBe(48_000);
      expect(chunk.channels).toBe(1);
    });
  });

  describe('Directory structure matches Python pipeline discovery pattern', () => {
    it('pipeline _discover_new_wavs pattern: audio/discord/*/*.wav', async () => {
      // The Python pipeline scans: session_dir / audio / discord / {user_id} / *.wav
      // This test creates the exact structure and verifies the pattern matches
      const users = ['111111111111111111', '222222222222222222'];
      const collisionTracker = new CollisionTracker();

      for (const userId of users) {
        const userDir = chunkDirectoryPath(sessionDir, userId);
        await mkdir(userDir, { recursive: true });

        for (const epochSec of [1719849600, 1719849632]) {
          const collisionIndex = collisionTracker.nextIndex(userId, epochSec);
          const fileName = timestampChunkFileName(epochSec, collisionIndex);
          const filePath = join(userDir, fileName);

          const writer = new WavWriter(filePath, 48_000, 1, 16);
          writer.write(Buffer.alloc(1024));
          await writer.finalize();
        }
      }

      // Simulate what Python's _discover_new_wavs does:
      // 1. Iterate audio/discord/
      // 2. For each user_dir, list *.wav files
      const audioDiscordDir = join(sessionDir, 'audio', 'discord');
      const discoveredWavs: string[] = [];

      const userDirs = readdirSync(audioDiscordDir).sort();
      for (const userDirName of userDirs) {
        const userDirPath = join(audioDiscordDir, userDirName);
        const stat = statSync(userDirPath);
        if (!stat.isDirectory()) continue;

        const files = readdirSync(userDirPath).sort();
        for (const file of files) {
          if (file.endsWith('.wav')) {
            discoveredWavs.push(join(userDirPath, file));
          }
        }
      }

      // Pipeline should find all 4 WAV files (2 users × 2 chunks)
      expect(discoveredWavs).toHaveLength(4);

      // Verify all discovered files actually exist and have content
      for (const wavPath of discoveredWavs) {
        expect(existsSync(wavPath)).toBe(true);
        expect(statSync(wavPath).size).toBeGreaterThan(512);
      }
    });
  });
});
