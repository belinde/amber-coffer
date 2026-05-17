import { describe, expect, it } from 'vitest';

import { resolveImageDisplayUrl } from './resolve-image-src.js';

describe('resolveImageDisplayUrl', () => {
  it('prefers thumbnail over canon', () => {
    expect(
      resolveImageDisplayUrl({
        thumbnailUrl: 'https://cdn.example/thumb.jpg',
        canonUrl: 'https://cdn.example/full.jpg',
      }),
    ).toBe('https://cdn.example/thumb.jpg');
  });

  it('returns null when only local path is set', () => {
    expect(resolveImageDisplayUrl({ local: 'portraits/alice.jpg' })).toBeNull();
  });
});
