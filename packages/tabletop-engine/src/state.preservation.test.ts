import type { Handout, Map, Token } from '@amber/shared';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { initialTabletopState, tabletopReducer } from './state.js';
import type { TabletopAction, TabletopState } from './state.js';

/**
 * Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.6
 *
 * Preservation property tests for the tabletop reducer.
 * These verify that existing action types produce the same state transitions
 * as before the bugfix (adding map.updated). Run on UNFIXED code to capture baseline.
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

const tabletopStateArb: fc.Arbitrary<TabletopState> = fc.record({
  activeMapId: fc.oneof(fc.constant(null), mapIdArb),
  maps: fc.array(mapArb, { minLength: 0, maxLength: 3 }),
  tokens: fc.array(tokenArb, { minLength: 0, maxLength: 5 }),
  tokenLabels: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 8 }),
    fc.string({ maxLength: 4 }),
  ),
  tokenNames: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 8 }),
    fc.string({ maxLength: 20 }),
  ),
  visibleHandouts: fc.array(handoutArb, { minLength: 0, maxLength: 3 }),
});

// Generate existing TabletopAction types (excluding map.updated which doesn't exist yet)
function existingActionArb(state: TabletopState): fc.Arbitrary<TabletopAction> {
  const actions: fc.Arbitrary<TabletopAction>[] = [
    // snapshot.applied
    fc.record({
      type: fc.constant('snapshot.applied' as const),
      activeMapId: fc.oneof(fc.constant(null), mapIdArb),
      maps: fc.array(mapArb, { minLength: 0, maxLength: 3 }),
      tokens: fc.array(tokenArb, { minLength: 0, maxLength: 5 }),
      tokenLabels: fc.dictionary(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.string({ maxLength: 4 }),
      ),
      tokenNames: fc.dictionary(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.string({ maxLength: 20 }),
      ),
      visibleHandouts: fc.array(handoutArb, { minLength: 0, maxLength: 3 }),
    }),
    // map.activated
    fc.record({
      type: fc.constant('map.activated' as const),
      mapId: mapIdArb,
    }),
    // token.created
    tokenArb.map((token) => ({ type: 'token.created' as const, token })),
    // token.moved
    fc.record({
      type: fc.constant('token.moved' as const),
      tokenId: tokenIdArb,
      position: tokenPositionArb,
    }),
    // token.removed
    fc.record({
      type: fc.constant('token.removed' as const),
      tokenId: tokenIdArb,
    }),
    // handout.shown
    handoutArb.map((handout) => ({ type: 'handout.shown' as const, handout })),
    // handout.hidden
    fc.record({
      type: fc.constant('handout.hidden' as const),
      handoutId: handoutIdArb,
    }),
    // session.ended
    fc.constant({ type: 'session.ended' as const }),
  ];

  // If state has tokens, also generate moves/removes targeting existing tokens
  if (state.tokens.length > 0) {
    actions.push(
      fc.record({
        type: fc.constant('token.moved' as const),
        tokenId: fc.constantFrom(...state.tokens.map((t) => t.id)),
        position: tokenPositionArb,
      }),
    );
  }

  return fc.oneof(...actions);
}

describe('2a. Reducer Preservation — existing action types produce identical output', () => {
  it('tabletopReducer produces deterministic output for all existing action types', () => {
    fc.assert(
      fc.property(tabletopStateArb, fc.integer({ min: 0, max: 7 }), (state, actionIdx) => {
        // Generate a specific action type based on index
        const actions: TabletopAction[] = [
          {
            type: 'snapshot.applied',
            activeMapId: state.activeMapId,
            maps: state.maps,
            tokens: state.tokens,
            tokenLabels: state.tokenLabels,
            tokenNames: state.tokenNames,
            visibleHandouts: state.visibleHandouts,
          },
          {
            type: 'map.activated',
            mapId: state.activeMapId ?? ('aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa' as Map['id']),
          },
          {
            type: 'token.created',
            token: state.tokens[0] ?? {
              id: 'bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb' as Token['id'],
              mapId: 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa' as Token['mapId'],
              entityKind: 'character' as const,
              entityId: 'e1',
              sessionId: null,
              displayName: null,
              position: { zone: 'board' as const, xCell: 0, yCell: 0 },
              visibleToPlayers: true,
              controlledByPlayerDiscordId: null,
              createdAt: 0,
              updatedAt: 0,
              version: 1,
            },
          },
          {
            type: 'token.moved',
            tokenId: (state.tokens[0]?.id ?? 'bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb') as Token['id'],
            position: { zone: 'bench' as const, slot: 0 },
          },
          {
            type: 'token.removed',
            tokenId: (state.tokens[0]?.id ?? 'bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb') as Token['id'],
          },
          {
            type: 'handout.shown',
            handout: state.visibleHandouts[0] ?? {
              id: 'cccccccc-cccc-7ccc-8ccc-cccccccccccc' as Handout['id'],
              campaignId: 'dddddddd-dddd-7ddd-8ddd-dddddddddddd' as Handout['campaignId'],
              sessionId: 'eeeeeeee-eeee-7eee-8eee-eeeeeeeeeeee' as Handout['sessionId'],
              label: 'Test',
              visibleToPlayers: true,
              shownAt: 1,
              createdAt: 0,
              updatedAt: 0,
              version: 1,
            },
          },
          {
            type: 'handout.hidden',
            handoutId: (state.visibleHandouts[0]?.id ??
              'cccccccc-cccc-7ccc-8ccc-cccccccccccc') as Handout['id'],
          },
          { type: 'session.ended' },
        ];

        const action = actions[actionIdx % actions.length]!;
        const result1 = tabletopReducer(state, action);
        const result2 = tabletopReducer(state, action);

        // Reducer is deterministic: same input → same output
        expect(result1).toEqual(result2);
      }),
      { numRuns: 200 },
    );
  });

  it('reducer handles all existing action types without throwing', () => {
    fc.assert(
      fc.property(tabletopStateArb, (state) => {
        const actionArb = existingActionArb(state);
        fc.assert(
          fc.property(actionArb, (action) => {
            const result = tabletopReducer(state, action);
            // Must return a valid TabletopState shape
            expect(result).toHaveProperty('activeMapId');
            expect(result).toHaveProperty('maps');
            expect(result).toHaveProperty('tokens');
            expect(result).toHaveProperty('tokenLabels');
            expect(result).toHaveProperty('tokenNames');
            expect(result).toHaveProperty('visibleHandouts');
            expect(Array.isArray(result.maps)).toBe(true);
            expect(Array.isArray(result.tokens)).toBe(true);
            expect(Array.isArray(result.visibleHandouts)).toBe(true);
          }),
          { numRuns: 10 },
        );
      }),
      { numRuns: 50 },
    );
  });
});

describe('2e. Existing Message Kinds Preservation — handled kinds produce same state transitions', () => {
  it('token.moved updates position for matching token', () => {
    fc.assert(
      fc.property(tokenArb, tokenPositionArb, (token, newPosition) => {
        const state: TabletopState = {
          ...initialTabletopState,
          tokens: [token],
        };
        const result = tabletopReducer(state, {
          type: 'token.moved',
          tokenId: token.id,
          position: newPosition,
        });
        const movedToken = result.tokens.find((t) => t.id === token.id);
        expect(movedToken?.position).toEqual(newPosition);
      }),
      { numRuns: 200 },
    );
  });

  it('token.created is idempotent — duplicate token not added', () => {
    fc.assert(
      fc.property(tokenArb, (token) => {
        const state: TabletopState = {
          ...initialTabletopState,
          tokens: [token],
        };
        const result = tabletopReducer(state, { type: 'token.created', token });
        expect(result.tokens).toHaveLength(1);
        // State reference unchanged (idempotent)
        expect(result).toBe(state);
      }),
      { numRuns: 200 },
    );
  });

  it('map.activated updates activeMapId', () => {
    fc.assert(
      fc.property(tabletopStateArb, mapIdArb, (state, newMapId) => {
        const result = tabletopReducer(state, { type: 'map.activated', mapId: newMapId });
        expect(result.activeMapId).toBe(newMapId);
        // Other fields unchanged
        expect(result.maps).toBe(state.maps);
        expect(result.tokens).toBe(state.tokens);
      }),
      { numRuns: 200 },
    );
  });
});

describe('2f. Session Ended Reset Preservation — session.ended resets to initial state', () => {
  it('session.ended always produces initialTabletopState regardless of current state', () => {
    fc.assert(
      fc.property(tabletopStateArb, (state) => {
        const result = tabletopReducer(state, { type: 'session.ended' });
        expect(result).toEqual(initialTabletopState);
      }),
      { numRuns: 200 },
    );
  });
});
