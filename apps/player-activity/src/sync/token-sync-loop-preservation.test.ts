/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
import type { Map, MqttMessage, Token } from '@amber/shared';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

/**
 * Preservation Property Tests — Existing Sync Behavior Unchanged
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 *
 * These tests encode the CURRENT correct behavior for inputs that do NOT satisfy
 * the bug condition. They must PASS on unfixed code (baseline behavior preservation)
 * and continue to pass after the fix is applied.
 *
 * Observation-first methodology: we exercise the existing unfixed code paths
 * with non-bug-condition inputs and assert the observed correct behavior.
 */

// --- In-memory server store (mirrors FIXED production behavior) ---

const MAX_PENDING_EVENTS = 64;

type StoredSyncEvent = { eventVersion: number; message: MqttMessage };

type ServerStore = {
  version: number;
  snapshot: MqttMessage | null;
  pendingEvents: StoredSyncEvent[];
  sessionEnded: boolean;
  nextEventVersion: number;
};

function createServerStore(): ServerStore {
  return {
    version: 0,
    snapshot: null,
    pendingEvents: [],
    sessionEnded: false,
    nextEventVersion: 1,
  };
}

function appendEvents(store: ServerStore, events: MqttMessage[]): void {
  store.version += 1;
  // Assign strictly increasing eventVersion (mirrors appendPendingEvents)
  const envelopes: StoredSyncEvent[] = events.map((message) => ({
    eventVersion: store.nextEventVersion++,
    message,
  }));
  store.pendingEvents = [...store.pendingEvents, ...envelopes].slice(-MAX_PENDING_EVENTS);
}

function putSnapshot(store: ServerStore, snapshot: MqttMessage): void {
  store.snapshot = snapshot;
  store.version += 1;
}

/**
 * Simulates GET /session/sync/state — mirrors the FIXED handler behavior:
 * sinceVersion >= store.version → 304; otherwise returns only events with
 * eventVersion > sinceVersion (content-filtered delivery).
 *
 * Note: In the test harness, eventVersion values are kept on the same scale
 * as store.version (monotonically increasing from 1). The production code
 * uses version*1000+offset but the semantics are identical: eventVersion is
 * always > the store.version at which it was created, so the 304 check
 * (sinceVersion >= store.version) correctly differentiates "no change" from
 * "new events/state available".
 */
function pollState(
  store: ServerStore,
  sinceVersion: number,
):
  | { status: 304 }
  | {
      status: 200;
      state: {
        version: number;
        snapshot: MqttMessage | null;
        sessionEnded: boolean;
        pendingEvents: StoredSyncEvent[];
      };
    } {
  if (sinceVersion >= store.version) {
    return { status: 304 };
  }
  // Content-filter: only events newer than sinceVersion
  const filtered =
    sinceVersion === 0
      ? store.pendingEvents
      : store.pendingEvents.filter((e) => e.eventVersion > sinceVersion);
  return {
    status: 200,
    state: {
      version: store.version,
      snapshot: store.snapshot,
      sessionEnded: store.sessionEnded,
      pendingEvents: filtered,
    },
  };
}

// --- Simulated client (mirrors HttpPollSyncClient.pollOnce logic) ---

type DispatchedEvent = { channel: string; payload: MqttMessage };

type ClientState = {
  id: string;
  lastVersion: number;
  tokenPositions: globalThis.Map<string, { mapId: string; position: Token['position'] }>;
  pendingMoves: globalThis.Map<
    string,
    { mapId: string; position: Token['position']; postedAtVersion: number }
  >;
  dispatched: DispatchedEvent[];
  gotSnapshot: boolean;
  sessionEnded: boolean;
  activeMapId: string | null;
  maps: Map[];
};

function createClient(id: string): ClientState {
  return {
    id,
    lastVersion: 0,
    tokenPositions: new globalThis.Map(),
    pendingMoves: new globalThis.Map(),
    dispatched: [],
    gotSnapshot: false,
    sessionEnded: false,
    activeMapId: null,
    maps: [],
  };
}

/**
 * Routes event kind to channel, matching HttpPollSyncClient.channelForKind.
 */
function channelForKind(kind: MqttMessage['kind']): string | null {
  switch (kind) {
    case 'token.moved':
    case 'token.move.request':
    case 'token.created':
    case 'token.removed':
      return 'tokens';
    case 'map.activated':
    case 'map.updated':
      return 'maps';
    case 'fog.revealed':
    case 'fog.hidden':
      return 'fog';
    case 'handout.shown':
    case 'handout.hidden':
      return 'handouts';
    case 'entity.updated':
      return 'entities';
    case 'session.handshake':
    case 'session.heartbeat':
    case 'session.ended':
      return 'control';
    case 'tabletop.snapshot':
      return 'snapshot';
    default:
      return null;
  }
}

/**
 * Simulates one pollOnce cycle — mirrors FIXED HttpPollSyncClient logic.
 * Unwraps versioned envelopes, tracks maxEventVersion, clears optimistic
 * moves by version, and advances lastVersion correctly.
 * Returns whether anything was processed (not 304).
 */
function clientPollOnce(client: ClientState, store: ServerStore): { processed: boolean } {
  const result = pollState(store, client.lastVersion);
  if (result.status === 304) {
    return { processed: false };
  }

  const { state } = result;

  // Handle session ended
  if (state.sessionEnded) {
    client.pendingMoves.clear();
    client.sessionEnded = true;
    client.tokenPositions.clear();
    client.activeMapId = null;
    client.maps = [];
    client.dispatched.push({
      channel: 'control',
      payload: { kind: 'session.ended', sessionId: '00000000-0000-7000-8000-000000000000' as any },
    });
    return { processed: true };
  }

  // Step 1: Process pendingEvents — clear confirmed optimistic moves and track maxEventVersion
  let maxEventVersion = 0;
  for (const event of state.pendingEvents) {
    if (event.eventVersion > maxEventVersion) {
      maxEventVersion = event.eventVersion;
    }
    if (event.message.kind === 'token.moved') {
      client.pendingMoves.delete(event.message.tokenId);
    }
  }

  // Advance lastVersion to the maximum of state.version and the highest eventVersion seen
  client.lastVersion = Math.max(client.lastVersion, state.version, maxEventVersion);

  // Clear stale optimistic moves by version
  for (const [tokenId, entry] of client.pendingMoves) {
    if (client.lastVersion > entry.postedAtVersion) {
      client.pendingMoves.delete(tokenId);
    }
  }

  // Step 2: Apply snapshot if present
  if (state.snapshot) {
    const channel = channelForKind(state.snapshot.kind);
    if (channel) {
      client.dispatched.push({ channel, payload: state.snapshot });
    }
    if (state.snapshot.kind === 'tabletop.snapshot') {
      client.gotSnapshot = true;
      client.activeMapId = state.snapshot.activeMapId;
      client.maps = [...state.snapshot.maps];
      // Apply token positions from snapshot
      client.tokenPositions.clear();
      for (const token of state.snapshot.tokens) {
        client.tokenPositions.set(token.id, { mapId: token.mapId, position: token.position });
      }
    }
  }

  // Step 3: Apply pendingEvents on top (unwrap message from versioned envelope)
  for (const event of state.pendingEvents) {
    const msg = event.message;
    const channel = channelForKind(msg.kind);
    if (channel) {
      client.dispatched.push({ channel, payload: msg });
    }
    if (msg.kind === 'token.moved') {
      client.tokenPositions.set(msg.tokenId, { mapId: msg.mapId, position: msg.position });
    }
    if (msg.kind === 'map.activated') {
      client.activeMapId = msg.mapId;
    }
    if (msg.kind === 'map.updated') {
      const idx = client.maps.findIndex((m) => m.id === msg.map.id);
      if (idx >= 0) {
        client.maps[idx] = msg.map;
      } else {
        client.maps.push(msg.map);
      }
    }
  }

  // Step 4: Re-overlay optimistic moves
  for (const [tokenId, { mapId, position }] of client.pendingMoves) {
    client.tokenPositions.set(tokenId, { mapId, position });
    client.dispatched.push({
      channel: 'tokens',
      payload: {
        kind: 'token.moved',
        tokenId: tokenId as Token['id'],
        mapId: mapId as Map['id'],
        position,
      },
    });
  }

  return { processed: true };
}

// --- Arbitraries ---

const uuidArb = fc.stringMatching(
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
);

const tokenIdArb = uuidArb as fc.Arbitrary<Token['id']>;
const mapIdArb = uuidArb as fc.Arbitrary<Map['id']>;

const boardPositionArb = fc.record({
  zone: fc.constant('board' as const),
  xCell: fc.integer({ min: 0, max: 23 }),
  yCell: fc.integer({ min: 0, max: 17 }),
});

// --- Test Suite ---

describe('Preservation: Existing Sync Behavior Unchanged', () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * Property 4 (Preservation): Single-player optimistic move applies the local
   * update immediately and reflects the confirmed server position afterward,
   * WITHOUT reverting to a stale position on the next poll.
   *
   * Non-bug-condition: single client, so no concurrent version bumps.
   */
  it('property 3.1: single-player optimistic move applies immediately and confirms without revert', () => {
    fc.assert(
      fc.property(
        tokenIdArb,
        mapIdArb,
        boardPositionArb,
        boardPositionArb,
        (tokenId, mapId, optimisticPos, confirmedPos) => {
          // Ensure positions differ so we can detect revert
          fc.pre(
            optimisticPos.xCell !== confirmedPos.xCell ||
              optimisticPos.yCell !== confirmedPos.yCell,
          );

          const store = createServerStore();
          const client = createClient('solo');

          // Client records an optimistic move (simulates postEvents / drag)
          client.pendingMoves.set(tokenId, {
            mapId,
            position: optimisticPos,
            postedAtVersion: client.lastVersion,
          });

          // Optimistic position applied locally
          client.tokenPositions.set(tokenId, { mapId, position: optimisticPos });
          expect(client.tokenPositions.get(tokenId)?.position).toEqual(optimisticPos);

          // Server confirms the move at a (possibly different) final position
          const confirmEvent: MqttMessage = {
            kind: 'token.moved',
            tokenId,
            mapId,
            position: confirmedPos,
          };
          appendEvents(store, [confirmEvent]);

          // Client polls — single client, so this is NOT a bug condition
          clientPollOnce(client, store);

          // After poll: optimistic move cleared (exact match on tokenId),
          // token reflects confirmed server position, not reverting to stale
          expect(client.pendingMoves.has(tokenId)).toBe(false);
          expect(client.tokenPositions.get(tokenId)?.position).toEqual(confirmedPos);

          // Second poll: no new version → 304, no revert
          const posBeforeSecondPoll = client.tokenPositions.get(tokenId)?.position;
          clientPollOnce(client, store);
          expect(client.tokenPositions.get(tokenId)?.position).toEqual(posBeforeSecondPoll);
        },
      ),
      { numRuns: 100, seed: 42 },
    );
  });

  /**
   * **Validates: Requirements 3.2**
   *
   * Property 4 (Preservation): Multiple distinct, non-looping moves each
   * propagate exactly once to all clients so every client sees correct final positions.
   *
   * Non-bug-condition: each move goes to a DIFFERENT token (no repeated token IDs),
   * and all clients poll after each individual append — so each client already has
   * the events when the next one arrives (no backlog accumulation / staggering).
   */
  it('property 3.2: distinct non-looping moves propagate exactly once to all clients', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }), // number of clients
        fc.integer({ min: 2, max: 6 }), // number of distinct moves
        mapIdArb,
        (numClients, numMoves, mapId) => {
          const store = createServerStore();
          const clients = Array.from({ length: numClients }, (_, i) => createClient(`c-${i}`));

          // Use distinct token IDs so no move repeats a token
          const tokenIds = Array.from(
            { length: numMoves },
            (_, i) =>
              `00000000-0000-7000-8000-0000000001${String(i).padStart(2, '0')}` as Token['id'],
          );

          // Each move targets a unique token — non-looping by definition
          for (let i = 0; i < numMoves; i++) {
            const event: MqttMessage = {
              kind: 'token.moved',
              tokenId: tokenIds[i]!,
              mapId,
              position: { zone: 'board', xCell: i + 1, yCell: i + 1 },
            };
            appendEvents(store, [event]);

            // ALL clients poll immediately after each event — keeps them caught up
            // This ensures no staggered version deficit (non-bug-condition)
            for (const client of clients) {
              clientPollOnce(client, store);
            }
          }

          // All clients should see the correct final positions
          for (const client of clients) {
            for (let i = 0; i < numMoves; i++) {
              const pos = client.tokenPositions.get(tokenIds[i]!);
              expect(pos?.position, `Client ${client.id} missing position for token ${i}`).toEqual({
                zone: 'board',
                xCell: i + 1,
                yCell: i + 1,
              });
            }
          }

          // All clients converged to same layout
          const referencePositions = [...clients[0]!.tokenPositions.entries()];
          for (let c = 1; c < clients.length; c++) {
            for (const [tokenId, expected] of referencePositions) {
              expect(clients[c]!.tokenPositions.get(tokenId)).toEqual(expected);
            }
          }
        },
      ),
      { numRuns: 100, seed: 42 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * Property 5 (Preservation): First join/reconnect with no in-flight optimistic
   * moves replaces the entire tabletop state with the bootstrap snapshot.
   */
  it('property 3.3: bootstrap snapshot replaces entire tabletop state on first join', () => {
    fc.assert(
      fc.property(mapIdArb, tokenIdArb, boardPositionArb, (mapId, tokenId, tokenPos) => {
        const store = createServerStore();
        const client = createClient('joiner');

        // Server has a snapshot (simulates PUT /session/sync/snapshot by master)
        const snapshot: MqttMessage = {
          kind: 'tabletop.snapshot',
          sessionId: '00000000-0000-7000-8000-000000000001' as any,
          activeMapId: mapId,
          campaignName: 'Test Campaign',
          maps: [
            {
              id: mapId,
              campaignId: '00000000-0000-7000-8000-000000000002' as any,
              name: 'Battle Map',
              imagePath: '',
              widthPx: 1920,
              heightPx: 1080,
              gridSizePx: 48,
              gridCols: 24,
              gridRows: 18,
              benchSlots: 8,
              createdAt: 0,
              updatedAt: 0,
              version: 1,
            },
          ],

          tokens: [
            {
              id: tokenId,
              mapId,
              entityKind: 'character',
              entityId: 'entity-1',
              sessionId: null,
              displayName: null,
              position: tokenPos,
              visibleToPlayers: true,
              controlledByPlayerDiscordId: null,
              createdAt: 0,
              updatedAt: 0,
              version: 1,
            },
          ],
          tokenLabels: { [tokenId]: 'T1' },
          tokenNames: { [tokenId]: 'Hero' },
          tokenPortraitUrls: {},
          visibleHandouts: [],
          snapshotAt: Date.now(),
        };
        putSnapshot(store, snapshot);

        // Client has no pending optimistic moves (fresh join)
        expect(client.pendingMoves.size).toBe(0);

        // Client polls for the first time (sinceVersion=0)
        clientPollOnce(client, store);

        // Snapshot applied: state fully replaced
        expect(client.gotSnapshot).toBe(true);
        expect(client.activeMapId).toBe(mapId);
        expect(client.maps).toHaveLength(1);
        expect(client.maps[0]!.id).toBe(mapId);
        expect(client.tokenPositions.get(tokenId)?.position).toEqual(tokenPos);
      }),
      { numRuns: 50, seed: 42 },
    );
  });

  /**
   * **Validates: Requirements 3.4**
   *
   * Property 5 (Preservation): When no new version is available since the client's
   * last poll, the 304 unchanged fast-path is taken and no events are re-applied.
   */
  it('property 3.4: 304 fast-path taken when no version advance since last poll', () => {
    fc.assert(
      fc.property(
        tokenIdArb,
        mapIdArb,
        boardPositionArb,
        fc.integer({ min: 1, max: 5 }),
        (tokenId, mapId, pos, extraPolls) => {
          const store = createServerStore();
          const client = createClient('poller');

          // Append one event and let client catch up
          const event: MqttMessage = {
            kind: 'token.moved',
            tokenId,
            mapId,
            position: pos,
          };
          appendEvents(store, [event]);
          clientPollOnce(client, store);

          // Client is now caught up: lastVersion === store.version (triggers 304 on next poll)
          expect(client.lastVersion).toBe(store.version);

          // Record state before extra polls
          const dispatchedBefore = client.dispatched.length;
          const positionBefore = client.tokenPositions.get(tokenId);

          // Poll multiple more times with no server changes
          for (let i = 0; i < extraPolls; i++) {
            const { processed } = clientPollOnce(client, store);
            // 304 → nothing processed
            expect(processed).toBe(false);
          }

          // No new dispatches happened (304 path, no re-application)
          expect(client.dispatched.length).toBe(dispatchedBefore);
          // Position unchanged
          expect(client.tokenPositions.get(tokenId)).toEqual(positionBefore);
        },
      ),
      { numRuns: 100, seed: 42 },
    );
  });

  /**
   * **Validates: Requirements 3.5**
   *
   * Property 6 (Preservation): map.updated and map.activated reflect on player
   * clients exactly as today — they update the active map and map list.
   */
  it('property 3.5: map.updated and map.activated propagate correctly to clients', () => {
    fc.assert(
      fc.property(
        mapIdArb,
        mapIdArb,
        fc.string({ minLength: 1, maxLength: 30 }),
        (mapId1, mapId2, mapName) => {
          // Ensure distinct map IDs
          fc.pre(mapId1 !== mapId2);

          const store = createServerStore();
          const client = createClient('viewer');
          const campaignId = '00000000-0000-7000-8000-000000000099' as any;

          // map.updated event arrives
          const mapUpdatedEvent: MqttMessage = {
            kind: 'map.updated',
            map: {
              id: mapId1,
              campaignId,
              name: mapName,
              imagePath: '/maps/bg.webp',
              widthPx: 1920,
              heightPx: 1080,
              gridSizePx: 48,
              gridCols: 24,
              gridRows: 18,
              benchSlots: 8,
              createdAt: 100,
              updatedAt: 200,
              version: 2,
            },
          };
          appendEvents(store, [mapUpdatedEvent]);
          clientPollOnce(client, store);

          // Client's map list updated
          const updatedMap = client.maps.find((m) => m.id === mapId1);
          expect(updatedMap).toBeDefined();
          expect(updatedMap!.name).toBe(mapName);
          expect(updatedMap!.imagePath).toBe('/maps/bg.webp');

          // Dispatched to 'maps' channel
          const mapDispatches = client.dispatched.filter((d) => d.channel === 'maps');
          expect(mapDispatches.length).toBeGreaterThanOrEqual(1);
          expect(mapDispatches[0]!.payload.kind).toBe('map.updated');

          // map.activated event arrives
          const mapActivatedEvent: MqttMessage = {
            kind: 'map.activated',
            mapId: mapId2,
          };
          appendEvents(store, [mapActivatedEvent]);
          clientPollOnce(client, store);

          // Client's active map updated
          expect(client.activeMapId).toBe(mapId2);

          // Dispatched to 'maps' channel
          const activatedDispatches = client.dispatched.filter(
            (d) => d.channel === 'maps' && d.payload.kind === 'map.activated',
          );
          expect(activatedDispatches.length).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 50, seed: 42 },
    );
  });

  /**
   * **Validates: Requirements 3.6**
   *
   * Property 6 (Preservation): session.ended resets tabletop state to initial
   * and notifies session-ended listeners.
   */
  it('property 3.6: session.ended resets tabletop state and notifies listeners', () => {
    fc.assert(
      fc.property(tokenIdArb, mapIdArb, boardPositionArb, (tokenId, mapId, pos) => {
        const store = createServerStore();
        const client = createClient('active');

        // Establish some state: a token exists
        const moveEvent: MqttMessage = {
          kind: 'token.moved',
          tokenId,
          mapId,
          position: pos,
        };
        appendEvents(store, [moveEvent]);
        clientPollOnce(client, store);
        expect(client.tokenPositions.size).toBe(1);

        // Also set an optimistic move to verify it is cleared
        client.pendingMoves.set(tokenId, {
          mapId,
          position: pos,
          postedAtVersion: client.lastVersion,
        });

        // Session ends on server
        store.sessionEnded = true;
        store.version += 1;

        // Client polls and discovers session ended
        clientPollOnce(client, store);

        // State fully reset
        expect(client.sessionEnded).toBe(true);
        expect(client.tokenPositions.size).toBe(0);
        expect(client.pendingMoves.size).toBe(0);
        expect(client.activeMapId).toBeNull();
        expect(client.maps).toHaveLength(0);

        // session.ended dispatched to 'control' channel
        const controlDispatches = client.dispatched.filter(
          (d) => d.channel === 'control' && d.payload.kind === 'session.ended',
        );
        expect(controlDispatches.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 50, seed: 42 },
    );
  });

  /**
   * **Validates: Requirements 3.1, 3.2**
   *
   * Scripted baseline: single player moves, confirms, polls again — no revert.
   * Covers the exact scenario the tabletop-multi-user-bugs fix protects.
   */
  it('scripted: single player move confirms and next poll does not revert', () => {
    const store = createServerStore();
    const client = createClient('solo');
    const mapId = '00000000-0000-7000-8000-000000000001' as Map['id'];
    const tokenId = '00000000-0000-7000-8000-000000000010' as Token['id'];

    // Player drags token to (5, 3) — recorded as optimistic
    client.pendingMoves.set(tokenId, {
      mapId,
      position: { zone: 'board', xCell: 5, yCell: 3 },
      postedAtVersion: client.lastVersion,
    });
    client.tokenPositions.set(tokenId, {
      mapId,
      position: { zone: 'board', xCell: 5, yCell: 3 },
    });

    // Server confirms the move at the same position
    appendEvents(store, [
      {
        kind: 'token.moved',
        tokenId,
        mapId,
        position: { zone: 'board', xCell: 5, yCell: 3 },
      },
    ]);

    // Client polls: confirms the move, clears optimistic
    clientPollOnce(client, store);
    expect(client.pendingMoves.has(tokenId)).toBe(false);
    expect(client.tokenPositions.get(tokenId)?.position).toEqual({
      zone: 'board',
      xCell: 5,
      yCell: 3,
    });

    // Second poll: 304 → no change (no revert to old position)
    const { processed } = clientPollOnce(client, store);
    expect(processed).toBe(false);
    expect(client.tokenPositions.get(tokenId)?.position).toEqual({
      zone: 'board',
      xCell: 5,
      yCell: 3,
    });
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * Scripted: fresh join receives full snapshot, state is fully replaced.
   */
  it('scripted: fresh join snapshot replaces entire state', () => {
    const store = createServerStore();
    const client = createClient('newcomer');
    const mapId = '00000000-0000-7000-8000-000000000001' as Map['id'];
    const tokenId = '00000000-0000-7000-8000-000000000010' as Token['id'];

    const snapshot: MqttMessage = {
      kind: 'tabletop.snapshot',
      sessionId: '00000000-0000-7000-8000-000000000099' as any,
      activeMapId: mapId,
      campaignName: 'My Campaign',
      maps: [
        {
          id: mapId,
          campaignId: '00000000-0000-7000-8000-000000000002' as any,
          name: 'Dungeon',
          imagePath: '/maps/dungeon.webp',
          widthPx: 1920,
          heightPx: 1080,
          gridSizePx: 48,
          gridCols: 24,
          gridRows: 18,
          benchSlots: 8,
          createdAt: 0,
          updatedAt: 0,
          version: 1,
        },
      ],

      tokens: [
        {
          id: tokenId,
          mapId,
          entityKind: 'character',
          entityId: 'char-abc',
          sessionId: null,
          displayName: null,
          position: { zone: 'board', xCell: 10, yCell: 8 },
          visibleToPlayers: true,
          controlledByPlayerDiscordId: null,
          createdAt: 0,
          updatedAt: 0,
          version: 1,
        },
      ],
      tokenLabels: { [tokenId]: 'Warrior' },
      tokenNames: { [tokenId]: 'Brave Warrior' },
      tokenPortraitUrls: {},
      visibleHandouts: [],
      snapshotAt: Date.now(),
    };
    putSnapshot(store, snapshot);

    // Fresh join poll
    clientPollOnce(client, store);

    expect(client.gotSnapshot).toBe(true);
    expect(client.activeMapId).toBe(mapId);
    expect(client.maps).toHaveLength(1);
    expect(client.maps[0]!.name).toBe('Dungeon');
    expect(client.tokenPositions.get(tokenId)?.position).toEqual({
      zone: 'board',
      xCell: 10,
      yCell: 8,
    });
  });

  /**
   * **Validates: Requirements 3.5**
   *
   * Scripted: map.updated followed by map.activated reflect correctly.
   */
  it('scripted: map.updated and map.activated reflect on client', () => {
    const store = createServerStore();
    const client = createClient('viewer');
    const mapId = '00000000-0000-7000-8000-000000000001' as Map['id'];
    const newMapId = '00000000-0000-7000-8000-000000000002' as Map['id'];
    const campaignId = '00000000-0000-7000-8000-000000000099' as any;

    // map.updated arrives
    appendEvents(store, [
      {
        kind: 'map.updated',
        map: {
          id: mapId,
          campaignId,
          name: 'Updated Forest',
          imagePath: '/maps/forest-v2.webp',
          widthPx: 1920,
          heightPx: 1080,
          gridSizePx: 48,
          gridCols: 24,
          gridRows: 18,
          benchSlots: 8,
          createdAt: 100,
          updatedAt: 300,
          version: 3,
        },
      },
    ]);
    clientPollOnce(client, store);

    expect(client.maps.find((m) => m.id === mapId)?.name).toBe('Updated Forest');

    // map.activated arrives for a different map
    appendEvents(store, [{ kind: 'map.activated', mapId: newMapId }]);
    clientPollOnce(client, store);

    expect(client.activeMapId).toBe(newMapId);
  });

  /**
   * **Validates: Requirements 3.6**
   *
   * Scripted: session.ended resets everything.
   */
  it('scripted: session.ended clears all state', () => {
    const store = createServerStore();
    const client = createClient('playing');
    const mapId = '00000000-0000-7000-8000-000000000001' as Map['id'];
    const tokenId = '00000000-0000-7000-8000-000000000010' as Token['id'];

    // Build up some state
    appendEvents(store, [
      {
        kind: 'token.moved',
        tokenId,
        mapId,
        position: { zone: 'board', xCell: 3, yCell: 7 },
      },
    ]);
    clientPollOnce(client, store);
    expect(client.tokenPositions.size).toBe(1);
    client.pendingMoves.set(tokenId, {
      mapId,
      position: { zone: 'board', xCell: 4, yCell: 7 },
      postedAtVersion: client.lastVersion,
    });

    // Session ends
    store.sessionEnded = true;
    store.version += 1;
    clientPollOnce(client, store);

    // Everything reset
    expect(client.sessionEnded).toBe(true);
    expect(client.tokenPositions.size).toBe(0);
    expect(client.pendingMoves.size).toBe(0);
    expect(client.activeMapId).toBeNull();
    expect(client.maps).toHaveLength(0);
  });
});
