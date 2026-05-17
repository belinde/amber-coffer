import { describe, expect, it } from 'vitest';

import { recordingManifestV2Schema } from './recording-manifest.schema.js';

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
