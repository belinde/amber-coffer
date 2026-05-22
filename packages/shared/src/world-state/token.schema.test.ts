import { describe, expect, it } from 'vitest';

import { tokenSchema } from './token.schema.js';

const tokenId = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa';
const mapId = 'bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb';

describe('tokenSchema.controlledByPlayerDiscordId', () => {
  it('accepts null and omits empty strings', () => {
    const base = {
      id: tokenId,
      mapId,
      entityKind: 'npc' as const,
      entityId: 'entity-1',
      position: { zone: 'bench' as const, slot: 0 },
      visibleToPlayers: true,
      createdAt: 0,
      updatedAt: 0,
      version: 1,
    };

    expect(
      tokenSchema.parse({ ...base, controlledByPlayerDiscordId: null }).controlledByPlayerDiscordId,
    ).toBeNull();
    expect(
      tokenSchema.parse({ ...base, controlledByPlayerDiscordId: '' }).controlledByPlayerDiscordId,
    ).toBeNull();
    expect(
      tokenSchema.parse({ ...base, controlledByPlayerDiscordId: '   ' })
        .controlledByPlayerDiscordId,
    ).toBeNull();
    expect(
      tokenSchema.parse({ ...base, controlledByPlayerDiscordId: '123456789012345678' })
        .controlledByPlayerDiscordId,
    ).toBe('123456789012345678');
  });
});

describe('tokenSchema custom session tokens', () => {
  const sessionId = 'cccccccc-cccc-7ccc-8ccc-cccccccccccc';

  it('requires sessionId and displayName for custom entity kind', () => {
    const custom = {
      id: tokenId,
      mapId,
      entityKind: 'custom' as const,
      entityId: tokenId,
      sessionId,
      displayName: 'Wolf pack',
      position: { zone: 'bench' as const, slot: 1 },
      visibleToPlayers: true,
      controlledByPlayerDiscordId: null,
      createdAt: 0,
      updatedAt: 0,
      version: 1,
    };
    expect(tokenSchema.parse(custom).displayName).toBe('Wolf pack');
    expect(() => tokenSchema.parse({ ...custom, sessionId: null })).toThrow();
  });
});
