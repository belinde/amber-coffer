/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion */
import type { Handout, Map, Token } from '@amber/shared';
import { initialTabletopState } from '@amber/tabletop-engine';
import * as fc from 'fast-check';
import { beforeEach, describe, expect, it } from 'vitest';

import { tabletopStore } from './store.js';

/**
 * Validates: Requirements 3.3, 3.5, 3.6
 *
 * Preservation property tests for TabletopStore.applyMqttMessage.
 * Verifies that existing message kinds (token.moved, token.created,
 * map.activated, session.ended) produce the same state transitions as before.
 */

// --- Arbitraries ---

const uuidV7Arb = fc.stringMatching(
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
);

const mapIdArb = uuidV7Arb as fc.Arbitrary<Map['id']>;
const tokenIdArb = uuidV7Arb as fc.Arbitrary<Token['id']>;
const campaignIdArb = uuidV7Arb as fc.Arbitrary<Map['campaignId']>;
const sessionIdArb = uuidV7Arb as fc.Arbitrary<Handout['sessionId']>;
const handoutIdArb = uuidV7Arb as fc.Arbitrary<Handout['id']>;

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

const handoutArb: fc.Arbitrary<Handout> = fc.record({
  id: handoutIdArb,
  campaignId: campaignIdArb,
  sessionId: sessionIdArb,
  label: fc.string({ minLength: 1, maxLength: 30 }),
  visibleToPlayers: fc.boolean(),
  shownAt: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 1_000_000 })),
  createdAt: fc.integer({ min: 0, max: 1_000_000 }),
  updatedAt: fc.integer({ min: 0, max: 1_000_000 }),
  version: fc.integer({ min: 1, max: 100 }),
});

function setupStateWithTokens(tokens: Token[], map: Map): void {
  tabletopStore.applyMqttMessage({
    kind: 'tabletop.snapshot',
    sessionId: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa' as any,
    activeMapId: map.id,
    maps: [map],
    tokens,
    tokenLabels: {},
    tokenNames: {},
    visibleHandouts: [],
    snapshotAt: Date.now(),
  });
}

describe('2e. Existing Message Kinds Preservation — handled kinds produce same state transitions via store', () => {
  beforeEach(() => {
    tabletopStore.dispatch({ type: 'session.ended' });
  });

  it('token.moved via applyMqttMessage updates position for matching token', () => {
    fc.assert(
      fc.property(tokenArb, mapArb, tokenPositionArb, (token, map, newPosition) => {
        tabletopStore.dispatch({ type: 'session.ended' });
        setupStateWithTokens([token], map);

        tabletopStore.applyMqttMessage({
          kind: 'token.moved',
          tokenId: token.id,
          mapId: token.mapId,
          position: newPosition,
        });

        const movedToken = tabletopStore.getState().tokens.find((t) => t.id === token.id);
        expect(movedToken?.position).toEqual(newPosition);
      }),
      { numRuns: 100 },
    );
  });

  it('token.created via applyMqttMessage adds new token to state', () => {
    fc.assert(
      fc.property(tokenArb, mapArb, tokenArb, (existingToken, map, newToken) => {
        // Ensure different IDs
        fc.pre(existingToken.id !== newToken.id);

        tabletopStore.dispatch({ type: 'session.ended' });
        setupStateWithTokens([existingToken], map);

        tabletopStore.applyMqttMessage({
          kind: 'token.created',
          token: newToken,
        });

        const state = tabletopStore.getState();
        expect(state.tokens).toHaveLength(2);
        expect(state.tokens.find((t) => t.id === newToken.id)).toEqual(newToken);
      }),
      { numRuns: 100 },
    );
  });

  it('map.activated via applyMqttMessage switches activeMapId', () => {
    fc.assert(
      fc.property(mapArb, mapIdArb, (map, newMapId) => {
        tabletopStore.dispatch({ type: 'session.ended' });
        setupStateWithTokens([], map);

        tabletopStore.applyMqttMessage({
          kind: 'map.activated',
          mapId: newMapId,
        });

        expect(tabletopStore.getState().activeMapId).toBe(newMapId);
      }),
      { numRuns: 100 },
    );
  });

  it('session.ended via applyMqttMessage resets state to initial', () => {
    fc.assert(
      fc.property(
        fc.array(tokenArb, { minLength: 1, maxLength: 5 }),
        mapArb,
        sessionIdArb,
        (tokens, map, sessionId) => {
          tabletopStore.dispatch({ type: 'session.ended' });
          setupStateWithTokens(tokens, map);

          // Verify state is non-empty
          expect(tabletopStore.getState().tokens.length).toBeGreaterThan(0);

          tabletopStore.applyMqttMessage({
            kind: 'session.ended',
            sessionId: sessionId as any,
          });

          expect(tabletopStore.getState()).toEqual(initialTabletopState);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('unhandled message kinds are silently ignored (state unchanged)', () => {
    fc.assert(
      fc.property(mapArb, tokenArb, (map, token) => {
        tabletopStore.dispatch({ type: 'session.ended' });
        setupStateWithTokens([token], map);

        const stateBefore = tabletopStore.getState();

        // These kinds are in the schema but not handled by applyMqttMessage
        tabletopStore.applyMqttMessage({
          kind: 'fog.revealed',
          regionId: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa' as any,
          mapId: map.id,
        });

        const stateAfter = tabletopStore.getState();
        // State reference should be unchanged (no dispatch occurred)
        expect(stateAfter).toBe(stateBefore);
      }),
      { numRuns: 50 },
    );
  });
});

describe('2f. Session Ended Reset Preservation — session.ended resets tabletop state to initial', () => {
  beforeEach(() => {
    tabletopStore.dispatch({ type: 'session.ended' });
  });

  it('session.ended always produces initialTabletopState regardless of prior state', () => {
    fc.assert(
      fc.property(
        fc.array(tokenArb, { minLength: 0, maxLength: 5 }),
        fc.array(mapArb, { minLength: 0, maxLength: 3 }),
        fc.array(handoutArb, { minLength: 0, maxLength: 3 }),
        mapIdArb,
        sessionIdArb,
        (tokens, maps, handouts, activeMapId, sessionId) => {
          tabletopStore.dispatch({ type: 'session.ended' });

          // Set up arbitrary state
          tabletopStore.applyMqttMessage({
            kind: 'tabletop.snapshot',
            sessionId: sessionId as any,
            activeMapId,
            maps,
            tokens,
            tokenLabels: {},
            tokenNames: {},
            visibleHandouts: handouts,
            snapshotAt: Date.now(),
          });

          // End session
          tabletopStore.applyMqttMessage({
            kind: 'session.ended',
            sessionId: sessionId as any,
          });

          expect(tabletopStore.getState()).toEqual(initialTabletopState);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sessionEndedListeners are notified on session.ended', () => {
    let notified = false;
    const unsub = tabletopStore.subscribeSessionEnded(() => {
      notified = true;
    });

    tabletopStore.applyMqttMessage({
      kind: 'session.ended',
      sessionId: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa' as any,
    });

    expect(notified).toBe(true);
    unsub();
  });
});
