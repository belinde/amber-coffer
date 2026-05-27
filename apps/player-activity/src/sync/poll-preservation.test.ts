/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
import type { Map, MqttMessage, SessionId, Token } from '@amber/shared';
import { initialTabletopState } from '@amber/tabletop-engine';
import * as fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';

import { tabletopStore } from '../features/tabletop/store.js';

/**
 * Validates: Requirements 3.1, 3.2
 *
 * Preservation property: For poll responses with pendingEvents: [],
 * the state transitions are identical to current behavior (snapshot replaces state).
 * This confirms that the empty-events path is unchanged by the bugfix.
 */

// --- Arbitraries ---

const uuidV7Arb = fc.stringMatching(
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
);

const mapIdArb = uuidV7Arb as fc.Arbitrary<Map['id']>;
const tokenIdArb = uuidV7Arb as fc.Arbitrary<Token['id']>;
const campaignIdArb = uuidV7Arb as fc.Arbitrary<Map['campaignId']>;
const sessionIdArb = uuidV7Arb as fc.Arbitrary<SessionId>;

const tokenPositionArb = fc.oneof(
  fc.record({
    zone: fc.constant('board' as const),
    xCell: fc.integer({ min: 0, max: 23 }),
    yCell: fc.integer({ min: 0, max: 17 }),
  }),
  fc.record({
    zone: fc.constant('bench' as const),
    slot: fc.integer({ min: 0, max: 11 }),
  }),
);

const tokenArb: fc.Arbitrary<Token> = fc.record({
  id: tokenIdArb,
  mapId: mapIdArb,
  entityKind: fc.constantFrom('character' as const, 'npc' as const, 'custom' as const),
  entityId: fc.string({ minLength: 1, maxLength: 10 }),
  sessionId: fc.constant(null),
  displayName: fc.constant(null),
  position: tokenPositionArb,
  visibleToPlayers: fc.boolean(),
  controlledByPlayerDiscordId: fc.constant(null),
  createdAt: fc.integer({ min: 0, max: 1_000_000 }),
  updatedAt: fc.integer({ min: 0, max: 1_000_000 }),
  version: fc.integer({ min: 1, max: 100 }),
});

const mapArb: fc.Arbitrary<Map> = fc.record({
  id: mapIdArb,
  campaignId: campaignIdArb,
  name: fc.string({ minLength: 1, maxLength: 30 }),
  imagePath: fc.string({ maxLength: 50 }),
  widthPx: fc.integer({ min: 1, max: 4096 }),
  heightPx: fc.integer({ min: 1, max: 4096 }),
  gridSizePx: fc.integer({ min: 10, max: 100 }),
  gridCols: fc.integer({ min: 1, max: 48 }),
  gridRows: fc.integer({ min: 1, max: 36 }),
  benchSlots: fc.integer({ min: 1, max: 24 }),
  createdAt: fc.integer({ min: 0, max: 1_000_000 }),
  updatedAt: fc.integer({ min: 0, max: 1_000_000 }),
  version: fc.integer({ min: 1, max: 100 }),
});

describe('2b. Poll Empty Events Preservation — empty pendingEvents produces same state as current', () => {
  beforeEach(() => {
    tabletopStore.dispatch({ type: 'session.ended' });
  });

  it('snapshot with empty pendingEvents replaces entire tabletop state', () => {
    fc.assert(
      fc.property(
        fc.array(tokenArb, { minLength: 1, maxLength: 5 }),
        mapArb,
        sessionIdArb,
        (tokens, map, sessionId) => {
          // Reset state
          tabletopStore.dispatch({ type: 'session.ended' });

          // Apply a snapshot directly (simulating what pollOnce does for empty pendingEvents)
          const snapshotPayload: MqttMessage = {
            kind: 'tabletop.snapshot',
            campaignName: null,
            sessionId: sessionId as any,
            activeMapId: map.id,
            maps: [map],
            tokens,
            tokenLabels: {},
            tokenNames: {},
            tokenPortraitUrls: {},
            visibleHandouts: [],
            snapshotAt: Date.now(),
          };

          tabletopStore.applyMqttMessage(snapshotPayload);

          const state = tabletopStore.getState();
          expect(state.activeMapId).toBe(map.id);
          expect(state.maps).toEqual([map]);
          expect(state.tokens).toEqual(tokens);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('applying snapshot to non-empty state fully replaces previous state', () => {
    fc.assert(
      fc.property(
        fc.array(tokenArb, { minLength: 1, maxLength: 3 }),
        fc.array(tokenArb, { minLength: 1, maxLength: 3 }),
        mapArb,
        mapArb,
        sessionIdArb,
        sessionIdArb,
        (tokensA, tokensB, mapA, mapB, sessionA, sessionB) => {
          // Reset state
          tabletopStore.dispatch({ type: 'session.ended' });

          // Apply first snapshot
          tabletopStore.applyMqttMessage({
            kind: 'tabletop.snapshot',
            campaignName: null,
            sessionId: sessionA as any,
            activeMapId: mapA.id,
            maps: [mapA],
            tokens: tokensA,
            tokenLabels: {},
            tokenNames: {},
            tokenPortraitUrls: {},
            visibleHandouts: [],
            snapshotAt: Date.now(),
          });

          // Apply second snapshot (simulating poll with empty pendingEvents)
          tabletopStore.applyMqttMessage({
            kind: 'tabletop.snapshot',
            campaignName: null,
            sessionId: sessionB as any,
            activeMapId: mapB.id,
            maps: [mapB],
            tokens: tokensB,
            tokenLabels: {},
            tokenNames: {},
            tokenPortraitUrls: {},
            visibleHandouts: [],
            snapshotAt: Date.now(),
          });

          const state = tabletopStore.getState();
          // Second snapshot fully replaces first
          expect(state.activeMapId).toBe(mapB.id);
          expect(state.maps).toEqual([mapB]);
          expect(state.tokens).toEqual(tokensB);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('poll response with sessionEnded=true triggers session.ended reset', () => {
    // This is a concrete preservation test: session ended always resets to initial
    tabletopStore.applyMqttMessage({
      kind: 'tabletop.snapshot',
      campaignName: null,
      sessionId: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa' as any,
      activeMapId: 'bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb' as any,
      maps: [],
      tokens: [],
      tokenLabels: {},
      tokenNames: {},
      tokenPortraitUrls: {},
      visibleHandouts: [],
      snapshotAt: Date.now(),
    });

    // Simulate session ended
    tabletopStore.applyMqttMessage({
      kind: 'session.ended',
      sessionId: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa' as any,
    });

    expect(tabletopStore.getState()).toEqual(initialTabletopState);
  });
});
