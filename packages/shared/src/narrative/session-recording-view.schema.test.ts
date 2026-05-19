import { describe, expect, it } from 'vitest';

import { sessionRecordingViewSchema } from './session-recording-view.schema.js';

describe('sessionRecordingViewSchema', () => {
  it('parses a recording row with optional character resolution', () => {
    const parsed = sessionRecordingViewSchema.parse({
      id: '0194a000-0000-7000-8000-000000000001',
      sessionId: '0194a000-0000-7000-8000-000000000002',
      userDiscordId: '616994893587283988',
      sourceKind: 'discord_capture',
      filePath: 'sessions/1/audio/discord/616994893587283988/0001.ogg',
      durationMs: 1200,
      sampleRate: 48000,
      channels: 2,
      createdAt: 1,
      updatedAt: 1,
      version: 1,
      characterId: '0194a000-0000-7000-8000-000000000003',
      characterName: 'Maren',
    });

    expect(parsed.characterName).toBe('Maren');
  });
});
