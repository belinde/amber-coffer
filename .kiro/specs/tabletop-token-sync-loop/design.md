# Tabletop Token Sync Loop — Bugfix Design

## Overview

During a live 5-player session the Player Activity tabletop never converges: once players
start moving tokens, every poll cycle re-applies a backlog of move events and re-overlays
uncleared optimistic moves, so tokens keep jumping autonomously for as long as anyone is
active (observed ~1 hour). This is a **non-convergence / feedback loop** defect, distinct
from the one-shot "stale snapshot clobber" already fixed in `tabletop-multi-user-bugs`.

The loop emerges from the interaction of three mechanisms across the sync pipeline:

1. **Server keeps a shared, never-drained rolling buffer.** `appendPendingEvents`
   (`infrastructure/lambdas/shared/session-sync-store.ts`) accumulates all recent move events
   in `pendingEvents` capped to the last 64 (`.slice(-MAX_PENDING_EVENTS)`). `clearPendingEvents`
   exists but is **never called** anywhere, so the backlog is never drained during play.
2. **`GET /session/sync/state` returns the entire buffer and `sinceVersion` does not
   content-filter.** In the handler, `sinceVersion` only chooses between the `304` fast-path and
   a `200` that ships the **whole** `pendingEvents` array. It never selects _which_ events a
   client has already seen. Because any player's move bumps the single `version` counter, every
   other client's next poll returns `200` with the full backlog.
3. **The client re-applies the full backlog and re-overlays its own optimistic moves every
   tick.** `HttpPollSyncClient.pollOnce()` (`apps/player-activity/src/sync/http-poll-sync-client.ts`)
   iterates the whole `pendingEvents` array each poll and re-dispatches every event, then
   re-overlays `pendingMoves`. `pendingMoves` only clears on an exactly matching `token.moved`,
   so an optimistic move that is never matched is re-applied indefinitely.

Together these produce perpetual replay/oscillation. The fix targets **convergence**:
per-client, version-filtered event delivery so each event reaches a client at most once;
draining the server backlog as it is delivered; and deterministic clearing of optimistic
moves once server state at or after the move's version reflects or supersedes it. The fix must
**preserve** the optimistic-move and snapshot-overlay behavior shipped by
`tabletop-multi-user-bugs` — it must not re-fix the one-shot stale-snapshot revert.

## Glossary

- **Bug_Condition (C)**: The set of poll/delivery conditions under which an event already
  processed by a client is delivered and re-applied again, or an optimistic in-flight move is
  re-overlaid even though server state already reflects or supersedes it.
- **Property (P)**: The desired behavior — every distinct event is applied at most once per
  client, optimistic moves are reconciled deterministically, and all clients converge to a
  single stable token layout once input stops.
- **Preservation**: Behavior that must remain unchanged — single-user optimistic move flow,
  multi-user single-delivery propagation, snapshot bootstrap on join/reconnect, the `304`
  unchanged fast-path, `map.updated` / `map.activated` propagation, and `session.ended` reset.
  This explicitly includes the corrections shipped by `tabletop-multi-user-bugs`.
- **`appendPendingEvents`**: Server function in `infrastructure/lambdas/shared/session-sync-store.ts`
  that merges new events into the rolling `pendingEvents` buffer and bumps `version`.
- **`clearPendingEvents`**: Server function in the same file intended to drain the buffer;
  currently dead code (never invoked).
- **`rowToStateResponse`**: Server helper that projects a `SessionSyncRow` into the
  `GET /session/sync/state` response shape.
- **`HttpPollSyncClient.pollOnce()`**: Client method in
  `apps/player-activity/src/sync/http-poll-sync-client.ts` that polls state, applies snapshot
  and `pendingEvents`, and re-overlays `pendingMoves`.
- **`pendingMoves`**: Client-side `Map<TokenId, {mapId, position}>` of optimistic moves posted
  via `postEvents()` but not yet confirmed; introduced by `tabletop-multi-user-bugs`.
- **`version`**: Monotonic session counter in `SessionSyncRow`, bumped by both
  `putSessionSnapshot` and `appendPendingEvents`; surfaced as `SessionSyncStateResponse.version`.
- **`sinceVersion`**: Query parameter (or `If-None-Match`) sent by the client carrying its
  `lastVersion`; today it only gates `304` vs `200`.
- **`eventVersion` (new)**: Per-event monotonic version assigned by the server when an event is
  appended, enabling per-client content filtering.

## Bug Details

### Bug Condition

The bug manifests whenever two or more clients are active and the server's
`GET /session/sync/state` returns events the requesting client has already processed, OR the
client re-overlays an optimistic move whose effect is already present in (or superseded by) the
server state at the response's version. Either condition causes a token to be re-positioned to
a value the client had already settled, which under continuous concurrent activity never
converges.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type {
           clientLastVersion: number,            // client's last processed version
           processedEventKeys: Set<EventKey>,     // identity of events already applied by client
           pollResponse: SessionSyncStateResponse,// the 200 body returned to this client
           pendingOptimisticMoves: Map<TokenId, { mapId, position, postedAtVersion }>,
           serverVersionReflecting: (TokenId) -> number | null  // version at/after which
                                                                 // server state reflects/supersedes the move
         }
  OUTPUT: boolean

  // (a) Replay: the response re-delivers at least one event the client already applied,
  //     because delivery is not version-filtered per client.
  redeliversAppliedEvent :=
    EXISTS e IN pollResponse.pendingEvents SUCH THAT processedEventKeys.has(identityOf(e))

  // (b) Version-bump amplification: a version change alone (caused by another client's move)
  //     forces a full-backlog 200 even though this client has nothing genuinely new.
  versionBumpRedelivery :=
    pollResponse.version > clientLastVersion
    AND NOT EXISTS e IN pollResponse.pendingEvents
        SUCH THAT NOT processedEventKeys.has(identityOf(e))

  // (c) Stale optimistic overlay: an in-flight move is re-overlaid even though the server
  //     state at/after the response version already reflects or supersedes it.
  staleOptimisticOverlay :=
    EXISTS m IN pendingOptimisticMoves SUCH THAT
      serverVersionReflecting(m.tokenId) IS NOT null
      AND serverVersionReflecting(m.tokenId) <= pollResponse.version
      AND stillOverlaid(m)

  RETURN redeliversAppliedEvent OR versionBumpRedelivery OR staleOptimisticOverlay
END FUNCTION
```

`identityOf(e)` is the logical identity of a delivered event (after the fix, its `eventVersion`;
today there is no such field, which is precisely why redelivery cannot be filtered).

### Examples

- **Backlog replay under two movers**: Player A moves token T1 to (5,3); Player B moves token
  T2 to (1,1). Both events sit in the shared 64-entry buffer. On A's next poll, `version` has
  advanced (B's move), so the handler returns `200` with the **full** buffer including A's own
  already-applied `token.moved` for T1. The client re-dispatches it; if A had since dragged T1
  to (6,3) optimistically, T1 visibly snaps back to (5,3). Repeat every 2s → oscillation.
- **Version-bump amplification**: With 5 active players, almost every 2s window contains at
  least one move, so `version` advances on nearly every poll for every client. No client ever
  hits the `304` fast-path; all clients re-apply the entire backlog every tick.
- **Uncleared optimistic move**: Player C's optimistic move for T3 is recorded in
  `pendingMoves`. The confirming `token.moved` for T3 ages out of the 64-entry window (or never
  exactly matches because a later move superseded it), so `pendingMoves.delete(T3)` never fires.
  Each poll re-overlays C's stale optimistic position for T3 forever.
- **Edge case (input stops)**: All players stop moving. Expected: the table settles to one
  identical layout on every client. Actual: the last backlog keeps being re-applied while
  `version` differs from each client's `lastVersion`, so motion continues until events age out.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Single-player optimistic move: local update applied immediately, confirmed server position
  reflected afterward, **without** the token reverting to a stale position on the next poll
  (the `tabletop-multi-user-bugs` correction). _(3.1)_
- Multiple distinct, non-looping moves: each move propagated exactly once to all clients so
  every client sees the correct final positions. _(3.2)_
- Full snapshot bootstrap on first join or reconnect when no in-flight optimistic moves exist:
  the entire tabletop state is replaced by the snapshot. _(3.3)_
- The unchanged-state fast-path: when no new version is available since a client's last poll,
  the `304` path is taken and no events are re-applied. _(3.4)_
- `map.updated` and `map.activated` continue to reflect on player clients exactly as today. _(3.5)_
- `session.ended` continues to reset tabletop state to initial and notify session-ended
  listeners. _(3.6)_

**Scope:**

All inputs that do NOT satisfy the bug condition must be completely unaffected by this fix.
This includes:

- Polls where the client genuinely has new, not-yet-applied events (these are delivered once).
- The first poll of a session (`sinceVersion = 0`, bootstrap snapshot).
- `304` responses (no version advance since the client's last poll).
- Non-move message kinds (`map.activated`, `map.updated`, `handout.shown`, `handout.hidden`,
  `token.created`, `token.removed`, `session.ended`).
- Single-client sessions (no concurrency, so no version-bump amplification).

**Note:** The expected _correct_ behavior for buggy inputs is defined in the Correctness
Properties section (Properties 1–3). This section enumerates what must NOT change.

## Hypothesized Root Cause

Based on code analysis of the pipeline, the root causes are:

1. **Server backlog is never drained (`clearPendingEvents` is dead code).**
   `appendPendingEvents` only ever appends and trims to the last 64 entries; nothing consumes or
   acknowledges delivered events. The backlog therefore persists across polls and is re-shipped
   in full.

2. **Delivery is not version-filtered per client.** `GET /session/sync/state` uses `sinceVersion`
   solely to decide `304` vs `200`; on `200` it returns the _entire_ `pendingEvents` array via
   `rowToStateResponse`. Events carry no per-event version, so the server cannot return "only
   what this client has not seen". Any version advance (from any client) re-delivers everything.

3. **Single global `version` couples all clients.** Because both snapshots and every event batch
   bump one shared counter, one client's move invalidates every other client's `sinceVersion`,
   guaranteeing full-backlog redelivery under concurrency (the amplification effect).

4. **Optimistic moves clear only on exact match.** `pendingMoves.delete(tokenId)` fires only when
   a `token.moved` for that exact token appears in the delivered batch. If the confirming event
   ages out of the 64-entry window or is superseded by a newer move, the optimistic entry is
   never cleared and is re-overlaid on every subsequent poll.

## Correctness Properties

Property 1: Bug Condition — Each Event Applied At Most Once Per Client

_For any_ sequence of polls by a client where the bug condition holds (the server would
otherwise re-deliver already-applied events), the fixed system SHALL deliver to that client only
events newer than its last processed version and SHALL advance the client's `lastVersion` across
the delivered window, so that each distinct event is applied at most once and already-applied
moves are never replayed.

**Validates: Requirements 2.1, 2.2, 2.4**

Property 2: Bug Condition — Version Advance Does Not Trigger Re-Application

_For any_ poll where the session version advanced because some other client posted a move, the
fixed system SHALL return to the requesting client only the events with `eventVersion` greater
than the client's `sinceVersion` (an empty set when the client has already seen them), so a
version change by itself never causes re-application of previously applied events.

**Validates: Requirements 2.2, 2.4**

Property 3: Bug Condition — Deterministic Optimistic Clearing And Convergence

_For any_ optimistic in-flight move, the fixed client SHALL clear that move once server state at
or after the move's posted version reflects or supersedes it (not only on an exact `token.moved`
match), so the optimistic move is never re-overlaid indefinitely; consequently, _for any_
sequence of moves that then stops, all clients SHALL converge to a single identical stable token
layout with no further autonomous movement.

**Validates: Requirements 2.3, 2.5**

Property 4: Preservation — Single And Multi-User Move Flow Unchanged

_For any_ input that does NOT satisfy the bug condition, the fixed system SHALL produce the same
observable result as the corrected (`tabletop-multi-user-bugs`) baseline: a single player's
optimistic move applies immediately and reflects the confirmed position without reverting, and
each distinct non-looping move propagates exactly once to all clients.

**Validates: Requirements 3.1, 3.2**

Property 5: Preservation — Snapshot Bootstrap And Unchanged Fast-Path

_For any_ first join/reconnect with no in-flight optimistic moves, the fixed code SHALL replace
the entire tabletop state with the snapshot; and _for any_ poll where no new version is available
since the client's last poll, the fixed code SHALL take the `304` unchanged fast-path without
re-applying events.

**Validates: Requirements 3.3, 3.4**

Property 6: Preservation — Map And Session Lifecycle Messages Unchanged

_For any_ `map.updated`, `map.activated`, or `session.ended` message, the fixed code SHALL
produce the same state transitions and listener notifications as the original code.

**Validates: Requirements 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct, the fix introduces **per-event versioning** so the
server can deliver each event to each client at most once, drains the backlog as it is delivered,
and clears optimistic moves deterministically by version.

**File**: `packages/shared/src/sync/session-sync.schema.ts` (contract — Zod at boundary)

1. **Introduce a versioned event envelope.** Add a `sessionSyncEventSchema`:
   ```
   sessionSyncEventSchema = z.object({
     eventVersion: z.number().int().positive(),
     message: mqttMessageSchema,
   })
   ```
   Change `sessionSyncStateResponseSchema.pendingEvents` from `z.array(mqttMessageSchema)` to
   `z.array(sessionSyncEventSchema)`. Re-export the inferred `SessionSyncEvent` type.
   _No new dependency_ — this extends existing Zod contracts, consistent with the
   "extend `mqttMessageSchema` / shared contracts, validate at boundaries" steering rules. The
   wire-format change is internal to the session-sync pipeline (master-app, player-activity,
   Lambda) and is justified because per-client filtering is impossible without a per-event
   version. Record the decision (ADR or migration note) since it is a contract change.

**File**: `infrastructure/lambdas/shared/session-sync-store.ts`

2. **Assign a per-event version on append.** In `appendPendingEvents`, give each appended event a
   monotonically increasing `eventVersion` (derived from the bumped `version` / a per-event
   sequence), storing `{ eventVersion, message }` entries in the rolling buffer. Keep the
   `MAX_PENDING_EVENTS` cap as a safety bound only.
3. **Drain delivered events.** Wire the currently-dead `clearPendingEvents` (or fold its logic
   into the read path) so events whose `eventVersion <= min(acknowledged versions)` are trimmed,
   preventing unbounded retention while still allowing slow clients to catch up within the window.
   At minimum, version-filtering on read (change 4) makes redelivery impossible even before
   trimming.

**File**: `infrastructure/lambdas/session-sync/src/handler.ts` (`GET /session/sync/state`)

4. **Content-filter events by `sinceVersion`.** When returning `200`, project the row through a
   `rowToStateResponse` that returns only events with `eventVersion > sinceVersion`, instead of
   the entire buffer. Keep the existing `304` decision (`sinceVersion >= state.version`) and the
   snapshot/`version`/ETag behavior unchanged.

**File**: `apps/player-activity/src/sync/http-poll-sync-client.ts` (`pollOnce`, `postEvents`)

5. **Advance `lastVersion` across the delivered window and apply each event once.** Iterate the
   filtered `pendingEvents`, dispatch each `message`, and set `lastVersion` to the maximum
   `eventVersion` seen (and to `state.version`). Because the server now returns only newer events,
   no replay occurs.
6. **Clear optimistic moves deterministically.** Track the version at which each optimistic move
   was posted (`postedAtVersion`). Clear a `pendingMoves` entry when the delivered window contains
   a `token.moved` for that token **or** when `lastVersion` reaches/exceeds the version at which
   the server state reflects/supersedes that token's position — not only on an exact match. This
   stops indefinite re-overlay while preserving the immediate optimistic update.
7. **Preserve snapshot/overlay ordering.** Keep the existing order: process the delivered events,
   apply the snapshot on first bootstrap, then re-overlay only the still-pending optimistic moves.
   Do not remove the `pendingMoves` overlay (it is the `tabletop-multi-user-bugs` fix).

**No change required** in `packages/tabletop-engine/src/state.ts` or
`apps/player-activity/src/features/tabletop/store.ts`: the reducer and `applyMqttMessage`
already handle every relevant `kind` (including `map.updated`). The fix is confined to delivery
semantics (which events reach the client, and when optimistic state clears), not to how an
individual message mutates state — this keeps preservation of message handling trivially intact.

## Testing Strategy

### Validation Approach

Two phases: first, surface counterexamples that demonstrate the loop on the **unfixed** code;
then verify the fix converges and preserves existing behavior. Property-based tests use
**fast-check** (the project's PBT library) over generated sequences of concurrent moves and polls.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the non-convergence loop BEFORE implementing
the fix, and confirm or refute the root-cause hypotheses. If refuted, re-hypothesize.

**Test Plan**: Drive the server store + a simulated multi-client poll loop with scripted
concurrent moves, then assert that token positions stabilize after input stops. Run on the
UNFIXED code to observe non-convergence and backlog replay.

**Test Cases**:

1. **Two-mover backlog replay** (will fail on unfixed code): Append `token.moved` for T1 and T2,
   poll as client A with `sinceVersion` equal to A's last version, assert A receives **no**
   already-applied events. On unfixed code A receives the full buffer.
2. **Version-bump amplification** (will fail on unfixed code): With client A caught up, append a
   move from client B (bumps `version`), poll A, assert A receives an **empty** event set. On
   unfixed code A receives the full backlog because `version > sinceVersion`.
3. **Uncleared optimistic move** (will fail on unfixed code): Post an optimistic move whose
   confirming `token.moved` never exactly matches (superseded by a later move), poll repeatedly,
   assert the optimistic overlay is cleared. On unfixed code it is re-overlaid every poll.
4. **Convergence after input stops** (will fail on unfixed code): Replay a scripted 5-client move
   sequence, then stop, run N further polls, assert every client's token layout is identical and
   stable across polls. On unfixed code positions keep changing.

**Expected Counterexamples**:

- `pendingEvents` returns already-applied events because delivery is not version-filtered.
- `version` advancing (any client's move) forces a full-backlog `200`.
- `pendingMoves` entries persist and re-overlay indefinitely when no exact `token.moved` match
  arrives.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed system produces the
expected (convergent, at-most-once) behavior.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  result := pollOnce_fixed(input)        // filtered delivery + deterministic clearing
  ASSERT expectedBehavior(result)
END FOR

FUNCTION expectedBehavior(result)
  RETURN  appliedAtMostOncePerEvent(result)                 // 2.1, 2.4
      AND deliveredOnlyNewerThanSinceVersion(result)        // 2.2
      AND optimisticMovesClearedByVersion(result)           // 2.3
      AND convergesToStableLayoutWhenInputStops(result)     // 2.5
END FUNCTION
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed system
produces the same result as the original (`tabletop-multi-user-bugs` baseline) system.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT pollOnce_original(input) = pollOnce_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing (fast-check) is recommended for preservation because
it generates many move/poll sequences and message kinds across the input domain, catching edge
cases (single client, empty backlog, `304` windows, non-move kinds) that hand-written tests miss.

**Test Plan**: Observe behavior on UNFIXED code for non-bug-condition inputs (single-user move,
distinct one-time moves, bootstrap snapshot, `304` fast-path, map/session messages), then write
tests that assert the fixed code reproduces it.

**Test Cases**:

1. **Single-user optimistic move preserved**: Observe immediate optimistic update + confirmed
   position without revert on unfixed code; assert unchanged after fix. _(3.1)_
2. **Distinct moves propagated once**: Observe each non-looping move reaching all clients once;
   assert unchanged after fix. _(3.2)_
3. **Bootstrap snapshot preserved**: Observe full-state replacement on first join with no
   in-flight moves; assert unchanged after fix. _(3.3)_
4. **`304` fast-path preserved**: Observe no re-application when version is unchanged; assert
   unchanged after fix. _(3.4)_
5. **Map/session messages preserved**: Observe `map.updated` / `map.activated` / `session.ended`
   transitions and listener notifications; assert unchanged after fix. _(3.5, 3.6)_

### Unit Tests

- `appendPendingEvents` assigns strictly increasing `eventVersion` to each appended event.
- `rowToStateResponse` (read path) returns only events with `eventVersion > sinceVersion`.
- `GET /session/sync/state` still returns `304` when `sinceVersion >= version`; returns only
  newer events on `200`.
- `clearPendingEvents` (now wired) trims delivered/acknowledged events and is no longer dead code.
- `pollOnce` advances `lastVersion` to the max delivered `eventVersion` and dispatches each
  event once.
- `pendingMoves` clears on either an exact `token.moved` match or a version at/after the move's
  `postedAtVersion` reflecting/superseding it.
- Reducer/`applyMqttMessage` regression: existing kinds still produce identical transitions
  (no behavioral change expected, guarding the "no engine change" assumption).

### Property-Based Tests

- Generate random interleavings of multi-client moves and polls; assert each distinct event is
  delivered to each client at most once (idempotent delivery). _(2.1, 2.2, 2.4)_
- Generate sequences ending in a quiescent period; assert all clients converge to one identical
  stable layout and no token position changes across subsequent polls. _(2.5)_
- Generate optimistic moves with confirmations that exact-match, supersede, or age out; assert
  every optimistic entry is eventually cleared and never re-overlaid after clearing. _(2.3)_
- Generate non-bug-condition inputs (single client, empty backlog, `304` windows, non-move
  kinds); assert fixed output equals baseline output (preservation). _(3.1–3.6)_

### Integration Tests

- Five simulated clients posting concurrent moves over a scripted timeline, then idle: assert
  convergence to a single shared layout with no autonomous movement (reproduces the reported
  one-hour loop scenario at small scale).
- Mixed traffic: token moves interleaved with `map.updated` / `map.activated`; assert map changes
  still propagate while moves converge.
- Reconnect mid-session: a client drops and rejoins, receives a bootstrap snapshot with no
  in-flight moves, then resumes version-filtered event delivery without replay.
- Session end during pending optimistic moves: state resets cleanly and no stale optimistic data
  leaks into a subsequent session.
