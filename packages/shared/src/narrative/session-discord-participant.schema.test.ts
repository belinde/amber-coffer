import { describe, expect, it } from 'vitest';

import { sessionDiscordParticipantSchema } from './session-discord-participant.schema.js';

describe('sessionDiscordParticipantSchema', () => {
  it('parses gm and player participants', () => {
    const parsed = sessionDiscordParticipantSchema.parse({
      discordUserId: '123',
      displayName: 'Aria',
      participantRole: 'player',
      isGm: false,
      totalDurationMs: 120_000,
      segmentCount: 1,
      defaultCharacterId: null,
      defaultCharacterName: null,
      assignments: [
        {
          id: '01900000-0000-7000-8000-000000000001',
          sessionId: '01900000-0000-7000-8000-000000000002',
          discordUserId: '123',
          discordDisplayName: 'Aria',
          participantRole: 'player',
          characterId: null,
          characterName: null,
          isPrimary: true,
          sortOrder: 0,
        },
      ],
    });
    expect(parsed.isGm).toBe(false);
  });
});
