import type { Token } from '@amber/shared';
import { describe, expect, it } from 'vitest';

import { canPlayerMoveToken } from './player-token-policy.js';

const mapId = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa' as Token['mapId'];
const tokenId = 'bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb' as Token['id'];
const playerA = '111111111111111111' as Token['controlledByPlayerDiscordId'] & string;
const playerB = '222222222222222222' as Token['controlledByPlayerDiscordId'] & string;

function baseToken(overrides: Partial<Token> = {}): Token {
  return {
    id: tokenId,
    mapId,
    entityKind: 'character',
    entityId: 'char-1',
    sessionId: null,
    displayName: null,
    position: { zone: 'board', xCell: 0, yCell: 0 },
    visibleToPlayers: true,
    controlledByPlayerDiscordId: playerA,
    createdAt: 0,
    updatedAt: 0,
    version: 1,
    ...overrides,
  };
}

describe('canPlayerMoveToken', () => {
  it('allows character token controlled by the player', () => {
    expect(canPlayerMoveToken(baseToken(), playerA)).toBe(true);
  });

  it('allows npc summon token with same controller', () => {
    expect(
      canPlayerMoveToken(baseToken({ entityKind: 'npc', entityId: 'npc-summon-1' }), playerA),
    ).toBe(true);
  });

  it('denies when controller is another player', () => {
    expect(canPlayerMoveToken(baseToken({ controlledByPlayerDiscordId: playerB }), playerA)).toBe(
      false,
    );
  });

  it('denies unassigned tokens', () => {
    expect(canPlayerMoveToken(baseToken({ controlledByPlayerDiscordId: null }), playerA)).toBe(
      false,
    );
  });

  it('denies when player id is missing', () => {
    expect(canPlayerMoveToken(baseToken(), null)).toBe(false);
  });

  it('denies hidden tokens', () => {
    expect(canPlayerMoveToken(baseToken({ visibleToPlayers: false }), playerA)).toBe(false);
  });
});
