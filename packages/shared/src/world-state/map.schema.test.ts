import { describe, expect, it } from 'vitest';

import { mapSchema } from './map.schema.js';

describe('mapSchema', () => {
  it('accepts optional backgroundPublicPath', () => {
    const parsed = mapSchema.parse({
      id: '018f0000-0000-7000-8000-000000000010',
      campaignId: '018f0000-0000-7000-8000-000000000001',
      name: 'Table 1',
      imagePath: 'images/map/bg.jpg',
      backgroundPublicPath: '/session-assets/c/s/map-background/x.webp',
      widthPx: 1920,
      heightPx: 1080,
      gridSizePx: 50,
      gridCols: 24,
      gridRows: 18,
      benchSlots: 12,
      createdAt: 0,
      updatedAt: 0,
      version: 1,
    });
    expect(parsed.backgroundPublicPath).toContain('/session-assets/');
  });
});
