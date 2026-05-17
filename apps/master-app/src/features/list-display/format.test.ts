import { describe, expect, it } from 'vitest';

import { compactJoin, truncatePreview } from './format.js';

describe('compactJoin', () => {
  it('joins non-empty parts', () => {
    expect(compactJoin(['Elf', null, 'Ranger'])).toBe('Elf · Ranger');
  });
});

describe('truncatePreview', () => {
  it('truncates long strings', () => {
    const long = 'a'.repeat(80);
    expect(truncatePreview(long, 20)?.length).toBe(20);
  });
});
