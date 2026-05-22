# Implementation Plan

## Overview

Fix three interrelated multi-user tabletop bugs.

## Tasks

- [x] 1. Write bug condition exploration test
  - **IMPORTANT**: Write this property-based test BEFORE implementing the fix
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **GOAL**: Surface counterexamples that demonstrate the three bugs on unfixed code
  - Test 1: Mock `getSessionSyncState` to return `pendingEvents: [{kind:'token.moved', tokenId:'t1', mapId:'m1', position:{zone:'board',xCell:5,yCell:3}}]`. Assert that after `pollOnce()`, the store contains the updated position. (will fail on unfixed code — pendingEvents are ignored)
  - Test 2: Call `tabletopStore.applyMqttMessage({kind:'map.updated', map:{...updatedMap}})`. Assert `state.maps` contains the updated map. (will fail on unfixed code — map.updated is unhandled)
  - Test 3: Verify CSS `.tabletop-token` has explicit `height` declaration that defeats `aspect-ratio: 1` on portrait grids (will fail on unfixed code — height is present)
  - Test 4: Set local state with token at (5,3), then apply a snapshot with token at (2,3) while a `pendingEvents` entry confirms (5,3). Assert final position is (5,3). (will fail on unfixed code — snapshot clobbers)
  - Run tests on UNFIXED code — expect FAILURE (proves bugs exist)
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct — it proves the bug conditions exist)
  - Mark task complete when tests are written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests
  - **IMPORTANT**: Write these tests BEFORE implementing the fix
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (normal operation):
  - **2a. Reducer Preservation**: For any `TabletopAction` of existing types, verify `tabletopReducer` produces identical output before and after adding `map.updated`
  - **2b. Poll Empty Events Preservation**: For poll responses with `pendingEvents: []`, verify state transitions are identical
  - **2c. Landscape Token Preservation**: For maps with `widthPx >= heightPx`, verify tokens render as circles (same as before)
  - **2d. Bench Token Preservation**: For tokens on the bench, verify 2.5rem fixed size and circular shape are unchanged
  - **2e. Existing Message Kinds Preservation**: For `MqttMessage` with kinds already handled (`token.moved`, `token.created`, `map.activated`, `session.ended`), verify same state transitions
  - **2f. Session Ended Reset Preservation**: Verify `session.ended` resets tabletop state to initial
  - Run all tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix CSS remove explicit height from token and ghost selectors
  - Remove `height: calc(100% * var(--token-fill, 0.9))` from `.tabletop-token` selector
  - Remove `height: calc(100% * var(--token-fill, 0.9))` from `.tabletop-ghost` selector
  - Keep `width` + `aspect-ratio: 1` combination to produce circles regardless of cell shape
  - Add `max-height: 100%` to prevent overflow in landscape cells
  - _Requirements: 2.4, 3.4, 3.5_

- [x] 4. Add map.updated action to TabletopAction union and tabletopReducer
  - Extend `TabletopAction` discriminated union with `{ type: 'map.updated'; map: Map }`
  - Add reducer case: replace matching entry in `state.maps` by `map.id`; if no match exists, append it
  - File: `packages/tabletop-engine/src/state.ts`
  - _Requirements: 2.3, 3.3_

- [x] 5. Add map.updated case to TabletopStore applyMqttMessage
  - Add `case 'map.updated': this.dispatch({ type: 'map.updated', map: payload.map }); return;` to the switch statement
  - File: `apps/player-activity/src/features/tabletop/store.ts`
  - _Requirements: 2.3, 1.3_

- [x] 6. Fix HttpPollSyncClient pollOnce to process pendingEvents
  - Process `pendingEvents` before snapshot: iterate over `state.pendingEvents`, parse each with `mqttMessageSchema`, and dispatch to the store handler
  - Add optimistic move tracking: introduce `private pendingMoves: Map<TokenId, TokenPosition>` that records token positions posted via `postEvents()` but not yet confirmed
  - When a snapshot arrives, re-apply pending moves on top of the snapshot state to avoid visual revert
  - Clear entries from `pendingMoves` when a matching `token.moved` event arrives in `pendingEvents`
  - Dispatch order: process `pendingEvents` first, then apply snapshot if present, then re-overlay any remaining optimistic moves
  - File: `apps/player-activity/src/sync/http-poll-sync-client.ts`
  - _Requirements: 2.1, 2.2, 3.1, 3.2_

- [x] 7. Verify bug condition exploration test now passes
  - Re-run the SAME tests from task 1 — do NOT write new tests
  - Re-run the SAME tests from task 2 — do NOT write new tests
  - **EXPECTED OUTCOME**: All tests PASS (confirms bugs are fixed and no regressions)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 8. Checkpoint - Ensure all tests pass
  - Run full test suite: `pnpm test`
  - Run typecheck: `pnpm typecheck`
  - Run lint: `pnpm lint`
  - Ensure all property-based tests pass
  - Ensure no regressions in existing tests

## Task Dependency Graph

```json
{
  "waves": [["1", "2"], ["3", "4"], ["5"], ["6"], ["7"], ["8"]]
}
```

## Notes

- Property-based tests use fast-check
