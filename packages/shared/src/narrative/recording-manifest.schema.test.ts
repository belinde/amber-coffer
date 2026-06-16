import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  recordingManifestChunkSchema,
  recordingManifestV2Schema,
} from './recording-manifest.schema.js';

// Feature: session-recording-live-transcription, Property 8: Schema accepts both codec literals
describe('recordingManifestChunkSchema — codec acceptance', () => {
  /** **Validates: Requirements 5.6** */
  it('accepts both opus_ogg (channels: 2) and pcm_wav (channels: 1)', () => {
    const codecArb = fc.oneof(
      fc.constant({ codec: 'opus_ogg' as const, channels: 2 as const }),
      fc.constant({ codec: 'pcm_wav' as const, channels: 1 as const }),
    );

    const chunkArb = fc.record({
      discordUserId: fc.string({ minLength: 1, maxLength: 20 }),
      displayName: fc.string({ minLength: 1, maxLength: 50 }),
      relativePath: fc.string({ minLength: 1, maxLength: 100 }),
      sessionOffsetMs: fc.nat(),
      durationMs: fc.nat(),
      sampleRate: fc.constant(48_000),
    });

    fc.assert(
      fc.property(chunkArb, codecArb, (base, codecPair) => {
        const chunk = { ...base, ...codecPair };
        const result = recordingManifestChunkSchema.safeParse(chunk);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

describe('recordingManifestV2Schema', () => {
  it('accepts chunked manifest with session offsets', () => {
    const parsed = recordingManifestV2Schema.parse({
      version: 2,
      sessionId: '01932f8a-0000-7000-8000-000000000001',
      sourceKind: 'discord_capture',
      startedAt: 1_000_000,
      endedAt: 1_100_000,
      channelId: '928310863235018772',
      chunks: [
        {
          discordUserId: '616994893587283988',
          displayName: 'Alice',
          relativePath: 'audio/discord/616994893587283988/0000.ogg',
          sessionOffsetMs: 0,
          durationMs: 32_000,
          codec: 'opus_ogg',
          sampleRate: 48_000,
          channels: 2,
        },
        {
          discordUserId: '616994893587283988',
          displayName: 'Alice',
          relativePath: 'audio/discord/616994893587283988/0001.ogg',
          sessionOffsetMs: 120_000,
          durationMs: 18_000,
          codec: 'opus_ogg',
          sampleRate: 48_000,
          channels: 2,
        },
      ],
    });

    expect(parsed.chunks).toHaveLength(2);
    expect(parsed.chunks[1]?.sessionOffsetMs).toBe(120_000);
  });
});
