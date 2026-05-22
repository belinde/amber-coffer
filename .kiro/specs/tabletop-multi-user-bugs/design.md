# Tabletop Multi-User Bugs — Bugfix Design

## Overview

Three interrelated bugs degrade the multi-user tabletop experience in the Player Activity Discord Activity. The root causes span the sync pipeline (`HttpPollSyncClient` ignoring `pendingEvents`, snapshot clobbering optimistic state), the state reducer (missing `map.updated` action), and the CSS token rendering (explicit `width`+`height` overriding `aspect-ratio: 1` on non-square grids). The fix strategy is minimal and targeted: process pending events before snapshots, track in-flight moves to avoid clobbering, add the missing reducer case, and remove the CSS height declaration that defeats aspect-ratio.

## Glossary

- **Bug_Condition (C)**: The set of conditions under which the three bugs manifest — multi-participant token moves with stale snapshots, `map.updated` messages arriving via poll, and portrait-oriented backgrounds stretching tokens
- **Property (P)**: The desired correct behavior — incremental events applied without clobbering, map backgrounds updating live, tokens remaining circular
- **Preservation**: Existing single-user move flow, snapshot bootstrap on first join, `map.activated` switching, landscape token rendering, bench token sizing, and session-ended reset must remain unchanged
- **`tabletopReducer`**: Pure function in `packages/tabletop-engine/src/state.ts` that reduces `TabletopAction` into `TabletopState`
- **`HttpPollSyncClient`**: Class in `apps/player-activity/src/sync/http-poll-sync-client.ts` that polls `GET /session/sync/state` and dispatches messages
- **`pendingEvents`**: Array of `MqttMessage` in `SessionSyncStateResponse` containing incremental state deltas confirmed by the server since `lastVersion`
- **`tabletopBoardAspectRatio`**: Utility in `packages/shared/src/tabletop/board-aspect-ratio.ts` returning the board's CSS `aspect-ratio` value from map dimensions

## Bug Details

### Bug Condition

The bugs manifest in three distinct but related scenarios during multi-user tabletop sessions:

1. **Stale snapshot clobber**: When multiple participants are present and one moves a token, the next poll cycle overwrites all positions with a stale snapshot because `pendingEvents` (which contain the confirmed `token.moved`) are never processed.
2. **Lost background updates**: When the GM changes the background on the active map, the `map.updated` message arrives in `pendingEvents` but is silently dropped — neither `pollOnce()` dispatches it nor does `applyMqttMessage` handle the `map.updated` kind.
3. **Elliptical tokens**: When the board has a portrait background (height > width), grid cells become taller than wide. The `.tabletop-token` rule sets both `width` and `height` to `calc(100% * var(--token-fill))`, which overrides `aspect-ratio: 1`, stretching tokens into ellipses.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type { scenario: 'snapshot-clobber' | 'map-update-lost' | 'token-stretch',
                         state: TabletopState, pollResponse: SessionSyncStateResponse,
                         mapAspectRatio: string }
  OUTPUT: boolean

  CASE input.scenario OF
    'snapshot-clobber':
      RETURN input.pollResponse.pendingEvents.length > 0
             AND input.pollResponse.pendingEvents.some(e => e.kind === 'token.moved')
             AND localOptimisticMovesExist(input.state)

    'map-update-lost':
      RETURN input.pollResponse.pendingEvents.some(e => e.kind === 'map.updated')

    'token-stretch':
      LET [w, h] = parseAspectRatio(input.mapAspectRatio)
      RETURN h > w   // portrait orientation → non-square grid cells
  END CASE
END FUNCTION
```

### Examples

- **Snapshot clobber**: Player A moves token T1 from (2,3) to (5,3). Before the server confirms, a poll returns a snapshot with T1 still at (2,3) plus a `pendingEvents` array containing `{kind:'token.moved', tokenId:'T1', position:{zone:'board',xCell:5,yCell:3}}`. The client ignores `pendingEvents` and applies the stale snapshot → T1 jumps back to (2,3).
- **Map update lost**: GM changes background from `forest.jpg` to `dungeon.jpg` on the active map. Server emits `{kind:'map.updated', map:{...backgroundPublicPath:'dungeon.jpg'}}` in `pendingEvents`. Client never dispatches it → board still shows `forest.jpg`.
- **Token stretch**: Map has `widthPx=1080, heightPx=1920`. Grid aspect-ratio becomes `1080/1920`. Each cell is taller than wide. Token CSS `width:90%; height:90%` fills the non-square cell → ellipse instead of circle.
- **Edge case (landscape)**: Map with `widthPx=1920, heightPx=1080` → cells are wider than tall. Current CSS still produces ellipses (wider than tall), but less noticeable. Fix must handle both orientations.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Single-participant optimistic move: local update applied immediately, final position reflected after server confirmation
- Full snapshot bootstrap on first join or reconnect (when no local optimistic moves pending) replaces entire state
- `map.activated` continues to switch `activeMapId` and render the new map's background
- Landscape-oriented backgrounds continue to render tokens as circles within square-ish grid cells
- Bench tokens rendered at fixed 2.5rem with circular shape regardless of board aspect ratio
- `session.ended` resets tabletop state to initial and notifies listeners

**Scope:**
All inputs that do NOT involve the three bug conditions should be completely unaffected by this fix. This includes:

- Poll responses with no `pendingEvents` (empty array)
- Messages of kinds already handled (`token.created`, `token.removed`, `handout.shown`, etc.)
- Maps with no background image (default aspect ratio)
- Mouse/touch interactions with tokens (drag & drop)

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **`pollOnce()` ignores `pendingEvents`**: The method in `HttpPollSyncClient` only processes `state.snapshot` — it never iterates over `state.pendingEvents`. The field exists in the schema (`sessionSyncStateResponseSchema`) and is populated by the server, but the client discards it.

2. **No optimistic move tracking**: When a snapshot arrives, it unconditionally replaces all state via `snapshot.applied`. There is no mechanism to detect that a local token move is "in flight" (posted but not yet confirmed) and should not be reverted by a stale snapshot position.

3. **Missing `map.updated` case in `applyMqttMessage`**: The `TabletopStore.applyMqttMessage` switch statement has no `case 'map.updated'`. Even if `pendingEvents` were dispatched, the message would fall through to the `default: return` branch. Additionally, `tabletopReducer` has no `map.updated` action type — the discriminated union and switch are both missing it.

4. **CSS `height` defeats `aspect-ratio`**: The `.tabletop-token` rule declares both `width: calc(100% * var(--token-fill))` and `height: calc(100% * var(--token-fill))`. Per CSS spec, when both `width` and `height` are set explicitly, `aspect-ratio` is ignored. On non-square grid cells the token fills the cell's full rectangular shape instead of constraining to a square.

## Correctness Properties

Property 1: Bug Condition — Pending Events Applied Before Snapshot

_For any_ poll response where `pendingEvents` is non-empty, the fixed `pollOnce()` SHALL iterate over each event, parse it as an `MqttMessage`, and dispatch it to the store handler, ensuring incremental state deltas (including `token.moved` and `map.updated`) are applied to the local state.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition — Map Updated Handled

_For any_ `MqttMessage` with `kind === 'map.updated'`, the fixed reducer SHALL replace the matching map object in `state.maps` (by `map.id`), causing the board to re-render with the updated `backgroundPublicPath` and dimensions.

**Validates: Requirements 2.3**

Property 3: Bug Condition — Tokens Remain Circular

_For any_ map aspect ratio (portrait or landscape), the fixed CSS SHALL render `.tabletop-token` elements as circles by ensuring `aspect-ratio: 1` is not overridden by explicit width+height declarations on both axes.

**Validates: Requirements 2.4**

Property 4: Preservation — Non-Pending-Event Poll Behavior

_For any_ poll response where `pendingEvents` is empty and a snapshot is present with no local optimistic moves pending, the fixed code SHALL produce exactly the same state as the original code (full snapshot replacement), preserving bootstrap and reconnect behavior.

**Validates: Requirements 3.1, 3.2**

Property 5: Preservation — Existing Message Kinds Unchanged

_For any_ `MqttMessage` with a kind already handled by `applyMqttMessage` (e.g., `token.moved`, `token.created`, `map.activated`, `session.ended`), the fixed code SHALL produce the same state transitions as the original code.

**Validates: Requirements 3.3, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `apps/player-activity/src/sync/http-poll-sync-client.ts`

**Function**: `pollOnce()`

**Specific Changes**:

1. **Process `pendingEvents` before snapshot**: After receiving the response, iterate over `state.pendingEvents`, parse each with `mqttMessageSchema`, and dispatch to the `'events'` channel (or a new dedicated channel). This ensures incremental deltas are applied.
2. **Add optimistic move tracking**: Introduce a `private pendingMoves: Map<TokenId, TokenPosition>` that records token positions posted via `postEvents()` but not yet confirmed. When a snapshot arrives, re-apply pending moves on top of the snapshot state to avoid visual revert. Clear entries from `pendingMoves` when a matching `token.moved` event arrives in `pendingEvents`.
3. **Dispatch order**: Process `pendingEvents` first (they represent confirmed server state), then apply snapshot if present, then re-overlay any remaining optimistic moves not yet confirmed.

**File**: `packages/tabletop-engine/src/state.ts`

**Type**: `TabletopAction` union + `tabletopReducer`

**Specific Changes**: 4. **Add `map.updated` action**: Extend the `TabletopAction` discriminated union with `{ type: 'map.updated'; map: Map }`. In the reducer, replace the matching entry in `state.maps` by `map.id`. If no match exists, append it.

**File**: `apps/player-activity/src/features/tabletop/store.ts`

**Function**: `applyMqttMessage()`

**Specific Changes**: 5. **Handle `map.updated` kind**: Add `case 'map.updated': this.dispatch({ type: 'map.updated', map: payload.map }); return;` to the switch statement.

**File**: `packages/ui/src/styles/tabletop.css`

**Selector**: `.tabletop-token`

**Specific Changes**: 6. **Remove explicit `height`**: Delete `height: calc(100% * var(--token-fill, 0.9));` from `.tabletop-token`. The `width` + `aspect-ratio: 1` combination will produce a square (circle with `border-radius: 50%`) regardless of cell shape. Adjust `max-height: 100%` to prevent overflow in landscape cells. 7. **Same fix for `.tabletop-ghost`**: Remove explicit `height` from `.tabletop-ghost` to keep ghost indicators circular too.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that exercise `pollOnce()` with mock responses containing `pendingEvents`, call `applyMqttMessage` with `map.updated` payloads, and render `.tabletop-token` in a portrait-ratio grid. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:

1. **Pending Events Ignored Test**: Mock `getSessionSyncState` to return `pendingEvents: [{kind:'token.moved', tokenId:'t1', mapId:'m1', position:{zone:'board',xCell:5,yCell:3}}]`. Assert that after `pollOnce()`, the store contains the updated position. (will fail on unfixed code)
2. **Map Updated Dropped Test**: Call `tabletopStore.applyMqttMessage({kind:'map.updated', map:{...updatedMap}})`. Assert `state.maps` contains the updated map. (will fail on unfixed code)
3. **Token Ellipse Test**: Render `TabletopBoard` with a portrait map (1080×1920). Measure computed token dimensions. Assert width === height. (will fail on unfixed code)
4. **Snapshot Clobber Test**: Set local state with token at (5,3), then apply a snapshot with token at (2,3) while a `pendingEvents` entry confirms (5,3). Assert final position is (5,3). (will fail on unfixed code)

**Expected Counterexamples**:

- `pendingEvents` array is never iterated in `pollOnce()` — events are silently discarded
- `map.updated` falls through to `default: return` in `applyMqttMessage`
- Token computed height ≠ computed width when grid cells are non-square

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**

```
FOR ALL pollResponse WHERE pendingEvents.length > 0 DO
  state_before := store.getState()
  pollOnce(pollResponse)
  state_after := store.getState()
  FOR EACH event IN pollResponse.pendingEvents DO
    ASSERT eventReflectedInState(event, state_after)
  END FOR
END FOR

FOR ALL mqttMessage WHERE mqttMessage.kind === 'map.updated' DO
  state_before := store.getState()
  applyMqttMessage(mqttMessage)
  state_after := store.getState()
  ASSERT state_after.maps.find(m => m.id === mqttMessage.map.id) === mqttMessage.map
END FOR

FOR ALL map WHERE map.heightPx > map.widthPx DO
  render TabletopBoard with map
  FOR EACH token element DO
    ASSERT computedWidth(token) === computedHeight(token)
  END FOR
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**

```
FOR ALL pollResponse WHERE pendingEvents.length === 0 DO
  ASSERT pollOnce_fixed(pollResponse) produces same state as pollOnce_original(pollResponse)
END FOR

FOR ALL mqttMessage WHERE mqttMessage.kind !== 'map.updated' DO
  ASSERT applyMqttMessage_fixed(mqttMessage) produces same state as applyMqttMessage_original(mqttMessage)
END FOR

FOR ALL map WHERE map.widthPx >= map.heightPx DO
  ASSERT tokenRendering_fixed(map) produces same visual output as tokenRendering_original(map)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many random `MqttMessage` payloads to verify existing handlers are unchanged
- It generates random map dimensions to verify token circularity across the full aspect-ratio spectrum
- It catches edge cases (zero-dimension maps, equal width/height, extreme ratios) that manual tests miss

**Test Plan**: Observe behavior on UNFIXED code first for all non-bug-condition inputs, then write property-based tests capturing that behavior.

**Test Cases**:

1. **Reducer Preservation**: For any `TabletopAction` of existing types, verify `tabletopReducer` produces identical output before and after adding `map.updated`
2. **Poll Empty Events Preservation**: For poll responses with `pendingEvents: []`, verify state transitions are identical
3. **Landscape Token Preservation**: For maps with `widthPx >= heightPx`, verify tokens render as circles (same as before)
4. **Bench Token Preservation**: For tokens on the bench, verify 2.5rem fixed size and circular shape are unchanged

### Unit Tests

- `tabletopReducer` with `map.updated` action: map exists → replaced; map missing → appended
- `applyMqttMessage` with `map.updated` kind dispatches correct action
- `pollOnce` iterates `pendingEvents` and dispatches each to handlers
- Optimistic move tracking: posted move survives snapshot, cleared on confirmation
- CSS: token in portrait grid has equal width and height (visual regression via snapshot or computed style)

### Property-Based Tests

- Generate random `TabletopState` + random `MqttMessage[]` arrays; verify all existing action types produce same state as before (preservation)
- Generate random map dimensions (1..4096 × 1..4096); verify token aspect ratio is always 1:1 after fix
- Generate random sequences of poll responses with/without `pendingEvents`; verify state converges to server truth without reverting confirmed moves

### Integration Tests

- Multi-participant flow: two clients polling, one moves a token, other client sees the move via `pendingEvents` without position revert
- GM changes background mid-session: player client receives `map.updated` in next poll and re-renders
- Portrait map with tokens: visual snapshot test confirming circular tokens
- Session end during pending moves: state resets cleanly, no stale optimistic data leaks
