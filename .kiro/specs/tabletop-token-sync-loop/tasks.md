# Implementation Plan

## Overview

This fix breaks the multi-client non-convergence/replay loop in the session-sync pipeline by introducing per-event versioning, version-filtered delivery, server backlog draining, and deterministic optimistic-move clearing so that clients apply each event at most once and converge to a stable token layout once input stops.

## Tasks

- [x] 1. Write bug condition exploration test (multi-client poll simulation)
  - **Property 1: Bug Condition** - Non-Convergence / Replay Loop
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the loop/non-convergence bug exists
  - **DO NOT attempt to fix the test or the production code when it fails** - the failure is the goal of this task
  - **NOTE**: This test encodes the Expected Behavior (Properties 1-3 in design) - it validates the fix once it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the perpetual replay/echo loop under concurrent multi-player moves
  - **Scoped PBT Approach**: Use fast-check to generate random interleavings of multi-client `token.moved` posts and poll cycles against the server store + a simulated multi-client poll loop. Seed with the deterministic scripted scenarios from the design's Examples for reproducibility.
  - Build the test harness wiring `appendPendingEvents` (server store) to N simulated `HttpPollSyncClient` instances polling `GET /session/sync/state`
  - Assertion A (convergence, 2.5): after input stops, run N further polls and assert every client's token layout is identical and stable across polls (no position changes) - _on unfixed code positions keep changing_
  - Assertion B (version-filtered delivery, 2.1/2.2/2.4): for a caught-up client A, after another client B posts a move (bumps `version`), poll A and assert A receives **no** already-applied events and an **empty** newer-event set - _on unfixed code A receives the full 64-entry backlog because `version > sinceVersion`_
  - Assertion C (optimistic-move clearing, 2.3): post an optimistic move whose confirming `token.moved` is superseded by a later move (never exact-matches), poll repeatedly, and assert the optimistic overlay is cleared - _on unfixed code it is re-overlaid every poll_
  - Run the test suite on UNFIXED code with `pnpm test`
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug condition `isBugCondition` holds: `redeliversAppliedEvent OR versionBumpRedelivery OR staleOptimisticOverlay`)
  - Document the counterexamples fast-check surfaces (e.g., "client A re-receives its own already-applied T1 move", "optimistic T3 re-overlaid for N polls", "layout never stabilizes after quiescence")
  - Mark task complete when the test is written, run, and the failure + counterexamples are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2. Write preservation property tests (BEFORE implementing the fix)
  - **Property 2: Preservation** - Existing Sync Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology - first observe actual outputs on UNFIXED code, then encode those observations as assertions
  - Use fast-check to generate non-bug-condition inputs (single client, empty backlog, `304` windows, non-move message kinds) plus the deterministic baseline cases below
  - Observe + assert (3.1): single-player optimistic move applies the local update immediately and reflects the confirmed server position afterward, **without** reverting to a stale position on the next poll
  - Observe + assert (3.2): multiple distinct, non-looping moves each propagate exactly once to all clients so every client sees the correct final positions
  - Observe + assert (3.3): first join/reconnect with no in-flight optimistic moves replaces the entire tabletop state with the bootstrap snapshot
  - Observe + assert (3.4): when no new version is available since the client's last poll, the `304` unchanged fast-path is taken and no events are re-applied
  - Observe + assert (3.5): `map.updated` and `map.activated` reflect on player clients exactly as today
  - Observe + assert (3.6): `session.ended` resets tabletop state to initial and notifies session-ended listeners
  - Run the test suite on UNFIXED code with `pnpm test`
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve - these inputs do NOT satisfy `isBugCondition`)
  - Mark task complete when the tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix the non-convergence / replay loop in the session-sync pipeline
  - [x] 3.1 Add versioned event envelope to the shared session-sync contract
    - In `packages/shared/src/sync/session-sync.schema.ts` add `sessionSyncEventSchema = z.object({ eventVersion: z.number().int().positive(), message: mqttMessageSchema })`
    - Change `sessionSyncStateResponseSchema.pendingEvents` from `z.array(mqttMessageSchema)` to `z.array(sessionSyncEventSchema)`
    - Re-export the inferred `SessionSyncEvent` type alongside existing exports (Zod validated at the boundary; no new dependency)
    - _Bug_Condition: enables `identityOf(e)` = `eventVersion` so `redeliversAppliedEvent` / `versionBumpRedelivery` can be filtered (design Bug Condition)_
    - _Expected_Behavior: `deliveredOnlyNewerThanSinceVersion(result)` (design expectedBehavior)_
    - _Preservation: contract still accepts all existing message kinds via `mqttMessageSchema`_
    - _Requirements: 2.2, 2.4_

  - [x] 3.2 Record the wire-contract change as an ADR / migration note
    - Add an ADR (or migration note under `docs/adr/` consistent with existing ADR numbering) documenting the `pendingEvents` wire-format change to versioned envelopes `{ eventVersion, message }`
    - State that **both** `apps/master-app` and `apps/player-activity` consume the session-sync contract, so the change is a coordinated contract migration internal to the session-sync pipeline (Lambda + both apps)
    - Justify per steering rules: per-client content filtering is impossible without a per-event version; extends existing Zod contracts rather than adding a dependency
    - Reference this ADR from the schema change in 3.1
    - _Bug_Condition: documents the structural change required to break the replay loop_
    - _Expected_Behavior: traceability for the convergence fix_
    - _Preservation: no behavioral change, documentation only_
    - _Requirements: 2.2, 2.4_

  - [x] 3.3 Assign per-event version and drain delivered events in the server store
    - In `infrastructure/lambdas/shared/session-sync-store.ts`, in `appendPendingEvents` assign each appended event a strictly increasing `eventVersion` (derived from the bumped `version` / a per-event sequence) and store `{ eventVersion, message }` entries in the rolling buffer
    - Keep the `MAX_PENDING_EVENTS` (64) cap as a safety bound only
    - Wire the currently-dead `clearPendingEvents` (or fold its logic into the read path) to trim events whose `eventVersion` is at/below acknowledged versions, preventing unbounded retention while letting slow clients catch up within the window
    - _Bug_Condition: addresses "server backlog never drained" + "no per-event version" root causes (design Root Cause 1 & 2)_
    - _Expected_Behavior: `appliedAtMostOncePerEvent(result)` via strictly increasing `eventVersion` (design expectedBehavior)_
    - _Preservation: `version` bump semantics and `MAX_PENDING_EVENTS` bound unchanged_
    - _Requirements: 2.1, 2.4_

  - [x] 3.4 Content-filter events by sinceVersion in the GET /session/sync/state handler
    - In `infrastructure/lambdas/session-sync/src/handler.ts`, when returning `200`, project the row through `rowToStateResponse` so it returns **only** events with `eventVersion > sinceVersion` instead of the entire buffer
    - Keep the existing `304` decision (`sinceVersion >= state.version`) and the snapshot / `version` / ETag behavior unchanged
    - _Bug_Condition: removes `versionBumpRedelivery` - a version advance no longer ships already-seen events (design Root Cause 2 & 3)_
    - _Expected_Behavior: `deliveredOnlyNewerThanSinceVersion(result)` (design expectedBehavior, Properties 1 & 2)_
    - _Preservation: `304` fast-path and snapshot/ETag path untouched (3.3, 3.4)_
    - _Requirements: 2.2, 2.4_

  - [x] 3.5 Advance lastVersion and apply each event once in the poll client
    - In `apps/player-activity/src/sync/http-poll-sync-client.ts` `pollOnce`, iterate the now-filtered `pendingEvents`, dispatch each `message` once, and set `lastVersion` to the maximum `eventVersion` seen (and to `state.version`)
    - Preserve the existing snapshot/overlay ordering: process delivered events, apply the snapshot on first bootstrap, then re-overlay only the still-pending optimistic moves (do NOT remove the `pendingMoves` overlay - it is the `tabletop-multi-user-bugs` fix)
    - _Bug_Condition: removes `redeliversAppliedEvent` re-application on the client (design Root Cause 2 & 3)_
    - _Expected_Behavior: `appliedAtMostOncePerEvent(result)` + `convergesToStableLayoutWhenInputStops(result)` (design expectedBehavior)_
    - _Preservation: snapshot bootstrap + optimistic overlay ordering preserved (3.1, 3.3)_
    - _Requirements: 2.1, 2.2, 2.5_

  - [x] 3.6 Clear optimistic moves deterministically by version in the poll client
    - In `apps/player-activity/src/sync/http-poll-sync-client.ts` `postEvents`, track the version at which each optimistic move was posted (`postedAtVersion`) on the `pendingMoves` entry
    - In `pollOnce`, clear a `pendingMoves` entry when the delivered window contains a `token.moved` for that token **or** when `lastVersion` reaches/exceeds the version at which server state reflects/supersedes that token's position - not only on an exact match
    - This stops indefinite re-overlay while preserving the immediate optimistic update
    - _Bug_Condition: removes `staleOptimisticOverlay` (design Root Cause 4)_
    - _Expected_Behavior: `optimisticMovesClearedByVersion(result)` + convergence (design expectedBehavior, Property 3)_
    - _Preservation: immediate optimistic update preserved, no stale-snapshot re-fix (3.1)_
    - _Requirements: 2.3, 2.5_

  - [x] 3.7 Confirm no change needed in engine reducer and tabletop store
    - Confirm `packages/tabletop-engine/src/state.ts` and `apps/player-activity/src/features/tabletop/store.ts` require NO change: `applyMqttMessage` and the reducer already handle every relevant `kind` (including `map.updated`)
    - The fix is confined to delivery semantics, not per-message state mutation - record this as a code comment only where a reviewer would expect a change, no logic edits
    - _Bug_Condition: N/A - asserts the fix scope boundary_
    - _Expected_Behavior: per-message handling unchanged_
    - _Preservation: reducer/`applyMqttMessage` transitions identical (3.5, 3.6)_
    - _Requirements: 3.5, 3.6_

  - [x] 3.8 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Convergent, At-Most-Once Delivery
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; passing confirms `expectedBehavior(result)` holds for all `isBugCondition(input)`
    - Run the exploration test from task 1 with `pnpm test`
    - **EXPECTED OUTCOME**: Test PASSES (confirms the loop is fixed: at-most-once delivery, empty set on pure version bump, deterministic optimistic clearing, convergence after input stops)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.9 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Sync Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests from task 2 with `pnpm test`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions across single-user move, distinct one-time moves, bootstrap snapshot, `304` fast-path, `map.updated`/`map.activated`/`session.ended`)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 4. Checkpoint - Ensure all tests and checks pass
  - Run `pnpm test` and confirm the exploration test (task 1) and preservation tests (task 2) all pass, plus the unit tests for `appendPendingEvents` (strictly increasing `eventVersion`), `rowToStateResponse` (`eventVersion > sinceVersion`), the `304` decision, and `clearPendingEvents` wiring
  - Run `pnpm typecheck` and confirm all packages are green (shared contract change propagates cleanly to both apps and the Lambda)
  - Run `pnpm lint` and confirm green
  - If any question or unexpected failure arises, stop and ask the user before proceeding
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

## Task Dependency Graph

```json
{
  "tasks": [
    {
      "id": "1",
      "name": "Bug condition exploration test (fails on unfixed code)",
      "dependsOn": [],
      "wave": 1
    },
    {
      "id": "2",
      "name": "Preservation property tests (pass on unfixed code)",
      "dependsOn": [],
      "wave": 1
    },
    {
      "id": "3.1",
      "name": "Shared contract: sessionSyncEventSchema + versioned pendingEvents",
      "dependsOn": ["1", "2"],
      "wave": 2
    },
    {
      "id": "3.2",
      "name": "ADR / migration note for wire-contract change",
      "dependsOn": ["3.1"],
      "wave": 3
    },
    {
      "id": "3.3",
      "name": "Server store: per-event eventVersion + drain clearPendingEvents",
      "dependsOn": ["3.1"],
      "wave": 3
    },
    {
      "id": "3.4",
      "name": "Handler: content-filter events by sinceVersion",
      "dependsOn": ["3.1", "3.3"],
      "wave": 4
    },
    {
      "id": "3.5",
      "name": "Poll client: advance lastVersion, apply each event once",
      "dependsOn": ["3.1", "3.4"],
      "wave": 5
    },
    {
      "id": "3.6",
      "name": "Poll client: deterministic optimistic clearing by version",
      "dependsOn": ["3.5"],
      "wave": 6
    },
    {
      "id": "3.7",
      "name": "Confirm engine reducer + tabletop store need no change",
      "dependsOn": ["3.5"],
      "wave": 6
    },
    {
      "id": "3.8",
      "name": "Verify exploration test now passes",
      "dependsOn": ["3.3", "3.4", "3.5", "3.6", "3.7"],
      "wave": 7
    },
    {
      "id": "3.9",
      "name": "Verify preservation tests still pass",
      "dependsOn": ["3.3", "3.4", "3.5", "3.6", "3.7"],
      "wave": 7
    },
    {
      "id": "4",
      "name": "Checkpoint: pnpm test + typecheck + lint green",
      "dependsOn": ["3.8", "3.9"],
      "wave": 8
    }
  ],
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2"],
      "description": "Author tests before the fix: exploration test must FAIL, preservation tests must PASS on unfixed code"
    },
    {
      "wave": 2,
      "tasks": ["3.1"],
      "description": "Shared versioned-event contract (foundation for per-client filtering)"
    },
    {
      "wave": 3,
      "tasks": ["3.2", "3.3"],
      "description": "ADR/migration note + server-side per-event versioning and backlog drain"
    },
    { "wave": 4, "tasks": ["3.4"], "description": "Handler version-filtered delivery on read" },
    {
      "wave": 5,
      "tasks": ["3.5"],
      "description": "Client applies filtered window once, advances lastVersion"
    },
    {
      "wave": 6,
      "tasks": ["3.6", "3.7"],
      "description": "Deterministic optimistic clearing + confirm no-change scope"
    },
    {
      "wave": 7,
      "tasks": ["3.8", "3.9"],
      "description": "Re-run same tests: exploration now PASSES, preservation still PASSES"
    },
    { "wave": 8, "tasks": ["4"], "description": "Full-suite checkpoint" }
  ]
}
```

## Notes

> **PBT note:** All property-based tests use **fast-check** (the project's PBT library), driven through Vitest. Property tasks above use the `**Property N:**` format so hover status works. Tasks are coding-only: every item is implemented and verified in the repo.
