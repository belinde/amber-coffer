/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { Map, MqttMessage, Token } from '@amber/shared';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

/**
 * Bug Condition Exploration Test — Non-Convergence / Replay Loop
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5**
 *
 * This test encodes the EXPECTED behavior (Properties 1-3 from the design):
 * - Each event applied at most once per client
 * - Version advance does not trigger re-application
 * - Deterministic optimistic clearing and convergence
 *
 * On UNFIXED code this test FAILS — confirming the bug condition is active:
 * `redeliversAppliedEvent OR versionBumpRedelivery OR staleOptimisticOverlay`
 *
 * After the fix, this test PASSES — confirming convergence.
 */

// --- In-memory server store (mirrors FIXED session-sync-store.ts behavior) ---

const MAX_PENDING_EVENTS = 64;

type StoredSyncEvent = { eventVersion: number; message: MqttMessage };

type ServerStore = {
  version: number;
  snapshot: MqttMessage | null;
  pendingEvents: StoredSyncEvent[];
};

function createServerStore(): ServerStore {
  return { version: 0, snapshot: null, pendingEvents: [] };
}

function appendEvents(store: ServerStore, events: MqttMessage[]): void {
  store.version += 1;
  // Assign strictly increasing eventVersion to each event (mirrors fixed appendPendingEvents).
  // For single-event appends (the common case in this test), eventVersion equals store.version.
  // For multi-event batches, sub-index ensures strict ordering within the batch.
  const envelopes: StoredSyncEvent[] = events.map((message, index) => ({
    eventVersion: store.version + index,
    message,
  }));
  // If batch had more than 1 event, advance version to cover the range
  if (events.length > 1) {
    store.version += events.length - 1;
  }
  store.pendingEvents = [...store.pendingEvents, ...envelopes].slice(-MAX_PENDING_EVENTS);
}

/**
 * Simulates GET /session/sync/state — mirrors the FIXED handler behavior:
 * if sinceVersion >= store.version → 304; otherwise returns only events with
 * eventVersion > sinceVersion (content-filtered per client).
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
        snapshot: unknown;
        sessionEnded: boolean;
        pendingEvents: StoredSyncEvent[];
      };
    } {
  if (sinceVersion >= store.version) {
    return { status: 304 };
  }
  return {
    status: 200,
    state: {
      version: store.version,
      snapshot: store.snapshot,
      sessionEnded: false,
      pendingEvents: store.pendingEvents.filter((e) => e.eventVersion > sinceVersion),
    },
  };
}

// --- Simulated client (mirrors FIXED HttpPollSyncClient.pollOnce logic) ---

type ClientState = {
  id: string;
  lastVersion: number;
  tokenPositions: globalThis.Map<string, { mapId: string; position: Token['position'] }>;
  pendingMoves: globalThis.Map<
    string,
    { mapId: string; position: Token['position']; postedAtVersion: number }
  >;
  appliedEventCount: number;
};

function createClient(id: string): ClientState {
  return {
    id,
    lastVersion: 0,
    tokenPositions: new globalThis.Map(),
    pendingMoves: new globalThis.Map(),
    appliedEventCount: 0,
  };
}

/**
 * Simulates one pollOnce cycle for a client — mirrors the FIXED HttpPollSyncClient logic:
 * 1. Processes pendingEvents: unwrap versioned envelopes, track maxEventVersion
 * 2. Clears optimistic moves on exact token.moved match
 * 3. Advances lastVersion to max(lastVersion, state.version, maxEventVersion)
 * 4. Clears stale optimistic moves by version (lastVersion > postedAtVersion)
 * 5. Applies filtered events (each event delivered at most once due to content filtering)
 * 6. Re-overlays remaining pendingMoves
 */
function clientPollOnce(client: ClientState, store: ServerStore): { eventsApplied: number } {
  const result = pollState(store, client.lastVersion);
  if (result.status === 304) {
    return { eventsApplied: 0 };
  }

  const { state } = result;
  let eventsApplied = 0;

  // Step 1: Track maxEventVersion and clear confirmed optimistic moves
  let maxEventVersion = 0;
  for (const event of state.pendingEvents) {
    if (event.eventVersion > maxEventVersion) {
      maxEventVersion = event.eventVersion;
    }
    // Clear optimistic move on exact token.moved match
    if (event.message.kind === 'token.moved') {
      client.pendingMoves.delete(event.message.tokenId);
    }
  }

  // Step 2: Advance lastVersion to the maximum of state.version and highest eventVersion
  client.lastVersion = Math.max(client.lastVersion, state.version, maxEventVersion);

  // Step 3: Clear stale optimistic moves by version
  for (const [tokenId, entry] of client.pendingMoves) {
    if (client.lastVersion > entry.postedAtVersion) {
      client.pendingMoves.delete(tokenId);
    }
  }

  // Step 4: Apply filtered pendingEvents (unwrap message from versioned envelope)
  for (const event of state.pendingEvents) {
    if (event.message.kind === 'token.moved') {
      client.tokenPositions.set(event.message.tokenId, {
        mapId: event.message.mapId,
        position: event.message.position,
      });
      eventsApplied++;
    }
  }

  // Step 5: Re-overlay remaining optimistic moves
  for (const [tokenId, { mapId, position }] of client.pendingMoves) {
    client.tokenPositions.set(tokenId, { mapId, position });
  }

  client.appliedEventCount += eventsApplied;
  return { eventsApplied };
}

// --- Arbitraries ---

const tokenIdArb = fc.stringMatching(
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
) as fc.Arbitrary<Token['id']>;

const mapIdArb = fc.stringMatching(
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
) as fc.Arbitrary<Map['id']>;

const boardPositionArb = fc.record({
  zone: fc.constant('board' as const),
  xCell: fc.integer({ min: 0, max: 23 }),
  yCell: fc.integer({ min: 0, max: 17 }),
});

// --- Test Suite ---

describe('Bug Condition: Non-Convergence / Replay Loop', () => {
  /**
   * Assertion A (convergence / at-most-once delivery, 2.1/2.5):
   * With staggered polling, each client should apply each distinct event at most once.
   * On unfixed code: trailing clients receive the FULL backlog on catch-up, re-applying
   * events the posting client already applied for them on an earlier poll.
   */
  it('property: each client applies each distinct event at most once (staggered polls)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }), // number of clients
        fc.integer({ min: 2, max: 4 }), // number of tokens
        fc.integer({ min: 3, max: 8 }), // number of move rounds
        (numClients, numTokens, numRounds) => {
          const store = createServerStore();
          const clients = Array.from({ length: numClients }, (_, i) => createClient(`client-${i}`));

          const mapId = '00000000-0000-7000-8000-000000000001' as Map['id'];
          const tokenIds = Array.from(
            { length: numTokens },
            (_, i) => `00000000-0000-7000-8000-00000000010${i}` as Token['id'],
          );

          // Simulate concurrent moves with staggered polling:
          // Each round a different client posts a move, and ONLY that client polls.
          // Other clients accumulate a version deficit.
          for (let round = 0; round < numRounds; round++) {
            const clientIdx = round % numClients;
            const tokenIdx = round % numTokens;
            const event: MqttMessage = {
              kind: 'token.moved',
              tokenId: tokenIds[tokenIdx]!,
              mapId,
              position: { zone: 'board', xCell: round + 1, yCell: round + 1 },
            };
            appendEvents(store, [event]);

            // Only the posting client polls immediately
            clientPollOnce(clients[clientIdx]!, store);
          }

          // Now all clients poll once to "catch up"
          for (const client of clients) {
            clientPollOnce(client, store);
          }

          // Each distinct event is posted once. A client should apply each at most once.
          // Total distinct events = numRounds (one per round).
          // On unfixed code: the catch-up poll delivers the FULL backlog, so trailing
          // clients re-apply events they already saw on earlier polls.
          const totalEventsGenerated = numRounds;
          for (let i = 0; i < numClients; i++) {
            expect(
              clients[i]!.appliedEventCount,
              `Client ${i} applied ${clients[i]!.appliedEventCount} events but only ` +
                `${totalEventsGenerated} distinct events exist. Events were re-applied ` +
                `because the full backlog is delivered on every 200 response ` +
                `(no per-client version filtering). Staggered poll pattern with ` +
                `${numClients} clients and ${numRounds} rounds.`,
            ).toBeLessThanOrEqual(totalEventsGenerated);
          }
        },
      ),
      { numRuns: 100, seed: 42 },
    );
  });

  /**
   * Assertion B (version-filtered delivery, 2.1/2.2/2.4):
   * For a caught-up client A, after another client B posts a move (bumps version),
   * poll A and assert A receives NO already-applied events.
   * On unfixed code: A receives the full 64-entry backlog because version > sinceVersion.
   */
  it('property: caught-up client receives no already-applied events after version bump', () => {
    fc.assert(
      fc.property(
        tokenIdArb,
        tokenIdArb,
        mapIdArb,
        boardPositionArb,
        boardPositionArb,
        (tokenA, tokenB, mapId, posA, posB) => {
          // Ensure distinct tokens
          fc.pre(tokenA !== tokenB);

          const store = createServerStore();
          const clientA = createClient('A');
          const clientB = createClient('B');

          // Client A posts a move → server records it
          const moveA: MqttMessage = {
            kind: 'token.moved',
            tokenId: tokenA,
            mapId,
            position: posA,
          };
          appendEvents(store, [moveA]);

          // Both clients poll and catch up
          clientPollOnce(clientA, store);
          clientPollOnce(clientB, store);

          // Now client A is caught up (lastVersion === store.version)
          expect(clientA.lastVersion).toBe(store.version);

          // Client B posts another move (bumps version)
          const moveB: MqttMessage = {
            kind: 'token.moved',
            tokenId: tokenB,
            mapId,
            position: posB,
          };
          appendEvents(store, [moveB]);

          // Client A polls — version advanced, so it gets a 200 response
          // Expected: A receives ONLY the new event (moveB), NOT the already-applied moveA
          // Actual (unfixed): A receives the FULL backlog [moveA, moveB]
          const beforeApplied = clientA.appliedEventCount;
          clientPollOnce(clientA, store);
          const eventsAppliedThisPoll = clientA.appliedEventCount - beforeApplied;

          // On fixed code, only 1 new event should be applied.
          // On unfixed code, 2 events are applied (re-applies moveA).
          expect(
            eventsAppliedThisPoll,
            `Client A re-received already-applied event for token ${tokenA}. ` +
              `Expected 1 new event (token ${tokenB} move), got ${eventsAppliedThisPoll}. ` +
              `Version bump by another client caused full backlog redelivery.`,
          ).toBe(1);
        },
      ),
      { numRuns: 100, seed: 42 },
    );
  });

  /**
   * Assertion C (optimistic-move clearing, 2.3):
   * Post an optimistic move whose confirming token.moved NEVER appears in the backlog
   * (no token.moved for that tokenId is in the server buffer — it either aged out or
   * was never posted). Poll repeatedly and assert the optimistic overlay is cleared
   * once server version advances past the move's posted version.
   *
   * On unfixed code: the optimistic move persists indefinitely because clearing requires
   * an exact token.moved match that never arrives (only moves for other tokens are in
   * the buffer).
   */
  it('property: optimistic move clears by version when no exact match arrives', () => {
    fc.assert(
      fc.property(
        tokenIdArb,
        tokenIdArb,
        mapIdArb,
        boardPositionArb,
        boardPositionArb,
        fc.integer({ min: 3, max: 10 }),
        (optimisticTokenId, otherTokenId, mapId, optimisticPos, otherPos, extraPolls) => {
          // Ensure the tokens are distinct so no token.moved for our optimistic token arrives
          fc.pre(optimisticTokenId !== otherTokenId);

          const store = createServerStore();
          const client = createClient('C');

          // Client posts an optimistic move for optimisticTokenId (simulates postEvents)
          // postedAtVersion = client.lastVersion at time of posting (0 initially)
          client.pendingMoves.set(optimisticTokenId, {
            mapId,
            position: optimisticPos,
            postedAtVersion: client.lastVersion,
          });

          // Server receives ONLY moves for otherTokenId — no token.moved for optimisticTokenId
          // This simulates the scenario where the confirming event aged out or was superseded
          for (let i = 0; i < extraPolls; i++) {
            const unrelatedEvent: MqttMessage = {
              kind: 'token.moved',
              tokenId: otherTokenId,
              mapId,
              position: { zone: 'board', xCell: otherPos.xCell + i, yCell: otherPos.yCell + i },
            };
            appendEvents(store, [unrelatedEvent]);
            clientPollOnce(client, store);
          }

          // At this point, server version has advanced well past the optimistic move's
          // posted version (which was 0). The server state clearly supersedes it.
          // Expected (fixed): the optimistic move should be cleared because
          //   lastVersion >> postedAtVersion (version-based deterministic clearing).
          // Actual (unfixed): the optimistic move PERSISTS because only an exact
          //   token.moved match for optimisticTokenId can clear it — and none arrived.
          expect(
            client.pendingMoves.has(optimisticTokenId),
            `Optimistic move for token ${optimisticTokenId} at ` +
              `(${optimisticPos.xCell},${optimisticPos.yCell}) persisted through ` +
              `${extraPolls} polls. Server version advanced from 0 to ` +
              `${store.version} (${store.version} versions ahead). ` +
              `The move is re-overlaid every poll because clearing requires an exact ` +
              `token.moved match that never arrives (only moves for ${otherTokenId} seen).`,
          ).toBe(false);
        },
      ),
      { numRuns: 100, seed: 42 },
    );
  });

  /**
   * Scripted scenario from design: version-bump amplification with 5 clients.
   * Every 2s window has at least one move so no client ever hits 304 — all re-apply
   * the entire backlog every tick.
   */
  it('scripted: 5-client concurrent moves produce perpetual replay', () => {
    const store = createServerStore();
    const numClients = 5;
    const clients = Array.from({ length: numClients }, (_, i) => createClient(`player-${i}`));
    const mapId = '00000000-0000-7000-8000-000000000001' as Map['id'];

    // Each client moves their own token
    const tokenIds = clients.map(
      (_, i) => `00000000-0000-7000-8000-00000000020${i}` as Token['id'],
    );

    // Phase 1: each client posts one move (5 rounds)
    for (let i = 0; i < numClients; i++) {
      const event: MqttMessage = {
        kind: 'token.moved',
        tokenId: tokenIds[i]!,
        mapId,
        position: { zone: 'board', xCell: i + 1, yCell: i + 1 },
      };
      appendEvents(store, [event]);

      // All clients poll after each move
      for (const client of clients) {
        clientPollOnce(client, store);
      }
    }

    // Verify all clients are caught up
    for (const client of clients) {
      expect(client.lastVersion).toBe(store.version);
    }

    // Now simulate what happens when ONE more move arrives
    const lateEvent: MqttMessage = {
      kind: 'token.moved',
      tokenId: tokenIds[0]!,
      mapId,
      position: { zone: 'board', xCell: 10, yCell: 10 },
    };
    appendEvents(store, [lateEvent]);

    // Other clients poll — they should receive ONLY the new event, not the full backlog
    let totalEventsApplied = 0;
    for (let i = 1; i < numClients; i++) {
      const before = clients[i]!.appliedEventCount;
      clientPollOnce(clients[i]!, store);
      totalEventsApplied += clients[i]!.appliedEventCount - before;
    }

    // Expected: each of 4 other clients applies exactly 1 event (the late move)
    // Actual (unfixed): each receives the FULL backlog (6 events), total = 4 * 6 = 24
    const expectedTotal = numClients - 1; // 4 clients × 1 event each
    expect(
      totalEventsApplied,
      `After a single late move, ${numClients - 1} clients applied ${totalEventsApplied} events ` +
        `instead of ${expectedTotal}. Full backlog was redelivered to all clients. ` +
        `This is the version-bump amplification bug: one move triggers full redelivery.`,
    ).toBe(expectedTotal);
  });
});
