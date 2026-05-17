import { describe, expect, it } from 'vitest';

import { generateUuidV7 } from './uuid-v7.js';

describe('generateUuidV7', () => {
  it('generates a valid UUID v7 string', () => {
    const id = generateUuidV7();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('generates unique ids', () => {
    const a = generateUuidV7();
    const b = generateUuidV7();
    expect(a).not.toBe(b);
  });
});
