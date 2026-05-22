import { describe, expect, it } from 'vitest';

import { sessionAssetUrl } from './session-asset-url.js';

describe('sessionAssetUrl', () => {
  it('returns relative paths unchanged', () => {
    expect(sessionAssetUrl('/session-assets/c/s/h.webp')).toBe('/session-assets/c/s/h.webp');
  });

  it('prefixes bare paths with slash', () => {
    expect(sessionAssetUrl('session-assets/x.webp')).toBe('/session-assets/x.webp');
  });

  it('passes through absolute https urls', () => {
    expect(sessionAssetUrl('https://table.example/x.webp')).toBe('https://table.example/x.webp');
  });
});
