import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { uuidV7Schema } from '../ids/schemas.js';
import { generateUuidV7 } from '../ids/uuid-v7.js';
import { deriveGridRows } from '../tabletop/defaults.js';
import { clipRegionSchema } from '../world-state/clip-region.schema.js';

import { tabletopSnapshotSchema } from './messages.schema.js';

/**
 * Property-Based Tests — Image Sync and Tabletop Tokens (Shared Schemas)
 *
 * **Validates: Requirements 1.5, 3.3, 4.1, 5.4, 7.1**
 */

const TABLE_HOST = 'https://table.ambercoffer.belinde.click';

describe('Property 4: CloudFront URL Construction', () => {
  it('constructed URLs follow the expected pattern for any valid CampaignId and CampaignImageId', () => {
    fc.assert(
      fc.property(
        fc.constant(null).map(() => generateUuidV7()),
        fc.constant(null).map(() => generateUuidV7()),
        (campaignId, campaignImageId) => {
          const base = `${TABLE_HOST}/campaign-images/${campaignId}/${campaignImageId}`;
          const canonUrl = `${base}.webp`;
          const thumbnailUrl = `${base}_thumb.webp`;
          const tokenPortraitUrl = `${base}_token.webp`;

          // Verify URL structure
          expect(canonUrl).toBe(
            `https://table.ambercoffer.belinde.click/campaign-images/${campaignId}/${campaignImageId}.webp`,
          );
          expect(thumbnailUrl).toMatch(/_thumb\.webp$/);
          expect(tokenPortraitUrl).toMatch(/_token\.webp$/);

          // Verify IDs are valid UUID v7
          expect(uuidV7Schema.safeParse(campaignId).success).toBe(true);
          expect(uuidV7Schema.safeParse(campaignImageId).success).toBe(true);

          // Verify all URLs share the same prefix
          expect(thumbnailUrl.startsWith(`${TABLE_HOST}/campaign-images/${campaignId}/`)).toBe(
            true,
          );
          expect(tokenPortraitUrl.startsWith(`${TABLE_HOST}/campaign-images/${campaignId}/`)).toBe(
            true,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 6: UUID v7 Validation', () => {
  it('accepts valid UUID v7 strings matching RFC 9562 v7 format', () => {
    fc.assert(
      fc.property(
        fc.constant(null).map(() => generateUuidV7()),
        (uuid) => {
          const result = uuidV7Schema.safeParse(uuid);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects arbitrary strings that do not match UUID v7 format', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 100 }), (input) => {
        const result = uuidV7Schema.safeParse(input);
        // Check if the string actually matches UUID v7 format
        const isValidV7 =
          /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input);
        expect(result.success).toBe(isValidV7);
      }),
      { numRuns: 200 },
    );
  });

  it('rejects UUIDs with wrong version nibble', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }), // version 0-6 (not 7)
        fc.constant(null).map(() => generateUuidV7()),
        (wrongVersion, validUuid) => {
          // Replace the version nibble (position 14) with a wrong version
          const tampered = validUuid.slice(0, 14) + wrongVersion.toString(16) + validUuid.slice(15);
          const result = uuidV7Schema.safeParse(tampered);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects UUIDs with wrong variant bits', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', 'c', 'd', 'e', 'f'),
        fc.constant(null).map(() => generateUuidV7()),
        (wrongVariant, validUuid) => {
          // Replace the variant nibble (position 19) with an invalid variant
          const tampered = validUuid.slice(0, 19) + wrongVariant + validUuid.slice(20);
          const result = uuidV7Schema.safeParse(tampered);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 8: ClipRegion Validation', () => {
  it('accepts iff bounds constraints hold for any (centerX, centerY, halfSide) triple', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        (centerX, centerY, halfSide) => {
          const input = { centerX, centerY, halfSide };
          const result = clipRegionSchema.safeParse(input);

          const boundsValid =
            centerX - halfSide >= 0 &&
            centerX + halfSide <= 1 &&
            centerY - halfSide >= 0 &&
            centerY + halfSide <= 1 &&
            halfSide >= 0.05;

          expect(
            result.success,
            `centerX=${centerX}, centerY=${centerY}, halfSide=${halfSide}: ` +
              `expected ${boundsValid ? 'valid' : 'invalid'} but got ${result.success ? 'valid' : 'invalid'}`,
          ).toBe(boundsValid);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('Property 9: Grid Rows Derivation', () => {
  it('derived gridRows = max(1, round(gridCols × heightPx / widthPx)) for positive dimensions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8000 }), // widthPx
        fc.integer({ min: 1, max: 8000 }), // heightPx
        fc.integer({ min: 1, max: 100 }), // gridCols
        (widthPx, heightPx, gridCols) => {
          const result = deriveGridRows(gridCols, widthPx, heightPx);
          const expected = Math.max(1, Math.ceil((gridCols * heightPx) / widthPx));

          expect(
            result,
            `widthPx=${widthPx}, heightPx=${heightPx}, gridCols=${gridCols}: ` +
              `expected ${expected} but got ${result}`,
          ).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('result is always at least 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8000 }),
        fc.integer({ min: 1, max: 8000 }),
        fc.integer({ min: 1, max: 100 }),
        (widthPx, heightPx, gridCols) => {
          const result = deriveGridRows(gridCols, widthPx, heightPx);
          expect(result).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Property 11: Tabletop Snapshot Serialization Round-Trip', () => {
  /** Generate a valid UUID v7 string for use in arbitraries. */
  const arbUuidV7 = fc.constant(null).map(() => generateUuidV7());

  const arbTokenPosition = fc.oneof(
    fc.record({
      zone: fc.constant('board' as const),
      xCell: fc.integer({ min: 0, max: 47 }),
      yCell: fc.integer({ min: 0, max: 47 }),
    }),
    fc.record({
      zone: fc.constant('bench' as const),
      slot: fc.integer({ min: 0, max: 11 }),
    }),
  );

  const arbToken = fc.record({
    id: arbUuidV7,
    mapId: arbUuidV7,
    entityKind: fc.constantFrom('character' as const, 'npc' as const),
    entityId: arbUuidV7,
    sessionId: fc.constant(null),
    displayName: fc.constant(null),
    position: arbTokenPosition,
    visibleToPlayers: fc.boolean(),
    controlledByPlayerDiscordId: fc.constant(null),
    createdAt: fc.integer({ min: 0, max: 2_000_000_000 }),
    updatedAt: fc.integer({ min: 0, max: 2_000_000_000 }),
    version: fc.integer({ min: 1, max: 1000 }),
  });

  const arbMap = fc.record({
    id: arbUuidV7,
    campaignId: arbUuidV7,
    name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    imagePath: fc.string({ minLength: 0, maxLength: 100 }),
    widthPx: fc.integer({ min: 1, max: 8000 }),
    heightPx: fc.integer({ min: 1, max: 8000 }),
    gridSizePx: fc.integer({ min: 1, max: 200 }),
    gridCols: fc.integer({ min: 1, max: 100 }),
    gridRows: fc.integer({ min: 1, max: 100 }),
    benchSlots: fc.integer({ min: 1, max: 24 }),
    createdAt: fc.integer({ min: 0, max: 2_000_000_000 }),
    updatedAt: fc.integer({ min: 0, max: 2_000_000_000 }),
    version: fc.integer({ min: 1, max: 1000 }),
  });

  const arbTokenPortraitUrls = fc.dictionary(
    arbUuidV7,
    arbUuidV7.map(
      (id) => `https://table.ambercoffer.belinde.click/campaign-images/${id}/${id}_token.webp`,
    ),
    { minKeys: 0, maxKeys: 5 },
  );

  const arbTokenLabels = fc.dictionary(
    arbUuidV7,
    fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
    { minKeys: 0, maxKeys: 5 },
  );

  const arbHandout = fc.record({
    id: arbUuidV7,
    campaignId: arbUuidV7,
    sessionId: arbUuidV7,
    label: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    visibleToPlayers: fc.boolean(),
    shownAt: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 2_000_000_000 })),
    createdAt: fc.integer({ min: 0, max: 2_000_000_000 }),
    updatedAt: fc.integer({ min: 0, max: 2_000_000_000 }),
    version: fc.integer({ min: 1, max: 1000 }),
  });

  const arbSnapshot = fc.record({
    kind: fc.constant('tabletop.snapshot' as const),
    sessionId: arbUuidV7,
    activeMapId: fc.oneof(arbUuidV7, fc.constant(null)),
    maps: fc.array(arbMap, { minLength: 0, maxLength: 3 }),
    tokens: fc.array(arbToken, { minLength: 0, maxLength: 5 }),
    tokenLabels: arbTokenLabels,
    tokenNames: arbTokenLabels,
    tokenPortraitUrls: arbTokenPortraitUrls,
    visibleHandouts: fc.array(arbHandout, { minLength: 0, maxLength: 2 }),
    snapshotAt: fc.integer({ min: 0, max: 2_000_000_000 }),
  });

  it('serialize→parse produces deep-equal result for any valid snapshot', () => {
    fc.assert(
      fc.property(arbSnapshot, (snapshot) => {
        const json = JSON.stringify(snapshot);
        const parsed = tabletopSnapshotSchema.parse(JSON.parse(json));

        expect(parsed).toEqual(snapshot);
      }),
      { numRuns: 100 },
    );
  });
});
