import { describe, expect, it } from 'vitest';

import { DEFAULT_PLAY_LANGUAGE, parsePlayLanguage } from './play-language.js';

describe('parsePlayLanguage', () => {
  it('returns valid locales unchanged', () => {
    expect(parsePlayLanguage('en')).toBe('en');
    expect(parsePlayLanguage('fr')).toBe('fr');
  });

  it('falls back to default for invalid values', () => {
    expect(parsePlayLanguage('de')).toBe(DEFAULT_PLAY_LANGUAGE);
    expect(parsePlayLanguage(null)).toBe(DEFAULT_PLAY_LANGUAGE);
  });
});
