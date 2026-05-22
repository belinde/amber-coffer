import { describe, expect, it } from 'vitest';

import { tokenLiteralLabel } from './token-label.js';

describe('tokenLiteralLabel', () => {
  it('uses initials from multiple words', () => {
    expect(tokenLiteralLabel('Aria Moonwhisper')).toBe('AM');
  });

  it('uses first two alnum chars for single word', () => {
    expect(tokenLiteralLabel('Grimjaw')).toBe('GR');
  });

  it('returns question mark for empty', () => {
    expect(tokenLiteralLabel('   ')).toBe('?');
  });
});
