import { describe, expect, it } from 'vitest';

import { mapSchema } from './map.schema.js';

describe('mapSchema', () => {
  it('accepts empty imagePath for maps without a background yet', () => {
    const parsed = mapSchema.parse({
      id: '01900000-0000-7000-8000-000000000001',
      campaignId: '01900000-0000-7000-8000-000000000002',
      name: 'Table 1',
      imagePath: '',
      widthPx: 1920,
      heightPx: 1440,
      gridSizePx: 50,
      gridCols: 24,
      gridRows: 18,
      benchSlots: 12,
      createdAt: 0,
      updatedAt: 0,
      version: 1,
    });

    expect(parsed.imagePath).toBe('');
  });
});
