import { describe, expect, it } from 'vitest';

import {
  discordIdToTokenColor,
  GM_TOKEN_COLOR,
  resolveTokenPlayerColor,
} from './token-player-color.js';

describe('discordIdToTokenColor', () => {
  it('is stable for the same discord id', () => {
    const a = discordIdToTokenColor('123456789012345678');
    const b = discordIdToTokenColor('123456789012345678');
    expect(a).toEqual(b);
  });

  it('differs for different discord ids', () => {
    const a = discordIdToTokenColor('111111111111111111');
    const b = discordIdToTokenColor('222222222222222222');
    expect(a.background).not.toBe(b.background);
  });
});

describe('resolveTokenPlayerColor', () => {
  it('uses GM color when controller is unset', () => {
    expect(resolveTokenPlayerColor({ controlledByPlayerDiscordId: null })).toEqual(GM_TOKEN_COLOR);
    expect(resolveTokenPlayerColor({ controlledByPlayerDiscordId: '' })).toEqual(GM_TOKEN_COLOR);
  });

  it('matches discordIdToTokenColor for the same controller', () => {
    const id = '123456789012345678';
    expect(resolveTokenPlayerColor({ controlledByPlayerDiscordId: id })).toEqual(
      discordIdToTokenColor(id),
    );
  });
});
