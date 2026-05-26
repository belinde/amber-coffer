# Tabletop Rendering Bugs — Bugfix Design

## Overview

Four rendering bugs affect the tabletop when portrait background images are used and when the Discord Activity loads or refreshes mid-session. The core issue is that `gridRows` is never recalculated when a background image is uploaded, causing a mismatch between the board aspect ratio (driven by `widthPx/heightPx`) and the grid ratio (fixed at `24/18`). This produces non-square cells for portrait images. Additionally, the player-activity has timing and caching issues with background rendering. The fix introduces a derived `gridRows` formula (`ceil(gridCols × heightPx / widthPx)`) anchored to `gridCols`, a GM slider for adjusting `gridCols`, and ensures fresh background URLs reach the player-activity immediately.

## Glossary

- **Bug_Condition (C)**: The set of inputs where the grid aspect ratio diverges from the image aspect ratio, OR where the player-activity fails to render the background on first load / after mid-session change
- **Property (P)**: Grid cells are always square (gridCols/gridRows ≈ widthPx/heightPx), background renders immediately on first snapshot, and fresh backgrounds are never served stale
- **Preservation**: Landscape maps, maps without backgrounds, token rendering, bench behavior, map activation, snapshot publishing, and session-end cleanup must remain unchanged
- **`tabletopBoardAspectRatio`**: Function in `packages/shared/src/tabletop/board-aspect-ratio.ts` that computes the CSS `aspect-ratio` for the board container
- **`buildTabletopBoardStyles`**: Function in `packages/ui/src/tabletop-board-styles.ts` that produces CSS custom properties for the board and grid elements
- **`update_map_background`**: Tauri command in `apps/master-app/src-tauri/src/commands/maps.rs` that normalizes, uploads, and persists a new background image
- **`gridCols`**: The anchor grid dimension (user-configurable, 8–48); rows are derived from it
- **`gridRows`**: Derived dimension: `ceil(gridCols × heightPx / widthPx)`

## Bug Details

### Bug Condition

The bugs manifest in two distinct domains:

**Domain A — Non-square grid cells**: When the GM uploads a background image whose aspect ratio differs from `gridCols/gridRows`, the board renders with the image's aspect ratio but the grid retains its original column/row counts, producing rectangular cells.

**Domain B — Stale/missing background on player-activity**: When the player-activity first loads or when the GM changes the background mid-session, the background image either doesn't render or shows a stale cached version.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type { map: Map, context: 'upload' | 'firstLoad' | 'midSessionChange' }
  OUTPUT: boolean

  // Domain A: grid/image aspect ratio mismatch
  IF input.context == 'upload' THEN
    hasBackground := map.imagePath.trim() != '' OR map.backgroundPublicPath exists
    imageRatio := map.widthPx / map.heightPx
    gridRatio := map.gridCols / map.gridRows
    RETURN hasBackground AND abs(imageRatio - gridRatio) > epsilon
  END IF

  // Domain B: background not rendered on player-activity
  IF input.context == 'firstLoad' THEN
    RETURN map.backgroundPublicPath exists
           AND snapshotContainsMap(map)
           AND backgroundNotRenderedAfterFirstSnapshot()
  END IF

  IF input.context == 'midSessionChange' THEN
    RETURN map.backgroundPublicPath changed
           AND browserServesStaleImage(map.backgroundPublicPath)
  END IF

  RETURN false
END FUNCTION
```

### Examples

- **Portrait upload**: GM uploads 1080×1920 image. System stores `widthPx=1080, heightPx=1920` but `gridRows` stays 18. Board aspect ratio becomes `1080/1920` (portrait) while grid is `24/18` (landscape). Cells are squashed horizontally. **Expected**: `gridRows = ceil(24 × 1920 / 1080) = 43`, grid ratio matches image ratio, cells are square.
- **Landscape upload**: GM uploads 1920×1080 image. `gridRows = ceil(24 × 1080 / 1920) = 14`. Grid ratio `24/14 ≈ 1.71` matches image ratio `1920/1080 ≈ 1.78` (close enough with ceiling). Cells are square.
- **First load blank**: Player joins Discord Activity, first poll returns snapshot with `backgroundPublicPath = "/session-assets/.../uuid.webp"`. Board renders blank because the snapshot is applied but the component reads the map from state before the snapshot dispatch completes or the `<img>` hasn't loaded yet.
- **Stale background**: GM changes background. New UUID path is delivered via `map.updated` event. Browser has cached the old image at a different path — but since each upload gets a new UUID, this should NOT happen unless the map object in state isn't updated. The real issue is that `TabletopPlayerView` reads `map` from props (passed by parent), not from the store's `maps[]` array after `map.updated` is applied.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Landscape-oriented backgrounds (widthPx ≥ heightPx) must continue to render with correct aspect ratio and square cells
- Maps with no background must continue to use default 4:3 aspect ratio and 24×18 grid
- Tokens on the board must continue to render as circles with proper grid placement
- Tokens on the bench must continue to render at fixed size (2.5rem) with circular shape
- Map activation (`map.activated`) must continue to switch maps correctly
- Tabletop snapshots must continue to include all map data including `backgroundPublicPath`
- Session end must continue to reset state and clear cached references
- Mouse/pointer drag-and-drop for tokens must remain unchanged

**Scope:**
All inputs that do NOT involve: (a) background image upload with aspect ratio different from current grid ratio, (b) first snapshot load on player-activity, or (c) mid-session background change — should be completely unaffected by this fix. This includes:

- Token movement (drag and drop)
- Bench slot positioning
- Handout display
- Fog of war events
- Session control messages

## Hypothesized Root Cause

Based on the bug description and code analysis, the root causes are:

1. **Missing `gridRows` recalculation on upload** (`apps/master-app/src-tauri/src/commands/maps.rs`): The `update_map_background` command stores `width_px` and `height_px` from the uploaded image but never recalculates `grid_rows`. The SQL UPDATE only touches `image_path`, `background_public_path`, `width_px`, `height_px`, `updated_at`, `version`.

2. **`tabletopBoardAspectRatio` uses image dimensions instead of grid dimensions** (`packages/shared/src/tabletop/board-aspect-ratio.ts`): The function returns `${map.widthPx} / ${map.heightPx}` when a background exists. This drives the board container's aspect ratio. But the CSS grid inside uses `gridCols/gridRows` for its own aspect ratio. If these don't match, cells are non-square. The fix should make the board aspect ratio use `gridCols/gridRows` (which will always produce square cells), and `gridRows` should be derived from the image dimensions.

3. **Player-activity reads `map` from props, not from updated store state**: In `TabletopPlayerView`, the `map` prop is passed from the parent component. When a `map.updated` event arrives, the store's `maps[]` array is updated, but if the parent doesn't re-read the active map from the store, the component keeps the stale `map` prop with the old `backgroundPublicPath`.

4. **No cache-busting needed (false alarm)**: Each upload already gets a unique UUID path via the presign Lambda. The "stale cache" issue is actually the stale prop issue from point 3. Once the map object in state is properly propagated, the new URL (with its unique UUID) will be used.

## Correctness Properties

Property 1: Bug Condition - Grid Cells Are Always Square

_For any_ map with a background image where `widthPx > 0` and `heightPx > 0`, after the fix is applied, the derived `gridRows` SHALL equal `ceil(gridCols × heightPx / widthPx)`, ensuring that the grid aspect ratio (`gridCols / gridRows`) approximates the image aspect ratio (`widthPx / heightPx`) and grid cells are rendered as squares.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - Non-Background Behavior Unchanged

_For any_ map where no background image exists (`imagePath` is empty AND `backgroundPublicPath` is absent), the fixed code SHALL produce the same grid dimensions (default 24×18) and aspect ratio (4/3) as the original code, preserving all existing default-grid behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

Property 3: Bug Condition - Background Renders on First Snapshot

_For any_ first snapshot received by the player-activity containing a map with a non-empty `backgroundPublicPath`, the fixed code SHALL resolve the background URL and pass it to the `TabletopBoard` component immediately after the snapshot is applied, without requiring additional polls.

**Validates: Requirements 2.3**

Property 4: Bug Condition - Fresh Background After Mid-Session Change

_For any_ `map.updated` event received by the player-activity with a changed `backgroundPublicPath`, the fixed code SHALL update the rendered map object so that the new background URL is used immediately, preventing stale image display.

**Validates: Requirements 2.4**

Property 5: Bug Condition - Grid Slider Updates Propagate

_For any_ `gridCols` value set by the GM via the slider (range 8–48), the fixed code SHALL persist the new `gridCols`, derive `gridRows = ceil(gridCols × heightPx / widthPx)`, publish a `map.updated` event, and re-publish the tabletop snapshot so the player-activity reflects the change in real time.

**Validates: Requirements 2.5, 2.6**

Property 6: Preservation - Token Positions Clamped on Grid Change

_For any_ token positioned on the board when `gridCols` changes, the fixed code SHALL preserve the token's position if it remains within bounds, or clamp it to the new grid boundaries (`xCell < newGridCols`, `yCell < newGridRows`) if it falls outside.

**Validates: Requirements 3.8**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `packages/shared/src/tabletop/defaults.ts`

**New Function**: `deriveGridRows`

**Specific Changes**:

1. **Add `deriveGridRows` utility**: `export function deriveGridRows(gridCols: number, widthPx: number, heightPx: number): number` — returns `Math.ceil(gridCols * heightPx / widthPx)` when both dimensions are positive, otherwise returns `TABLETOP_GRID_ROWS` default.

---

**File**: `packages/shared/src/tabletop/board-aspect-ratio.ts`

**Function**: `tabletopBoardAspectRatio`

**Specific Changes**: 2. **Use grid dimensions for aspect ratio**: Change the return value from `${map.widthPx} / ${map.heightPx}` to `${map.gridCols} / ${map.gridRows}`. This ensures the board container's aspect ratio always matches the grid, producing square cells. The function signature should accept `gridCols` and `gridRows` (or the full map).

---

**File**: `apps/master-app/src-tauri/src/commands/maps.rs`

**Function**: `update_map_background`

**Specific Changes**: 3. **Recalculate `gridRows` on background upload**: After obtaining `uploaded.width_px` and `uploaded.height_px`, compute `grid_rows = (existing.grid_cols as f64 * uploaded.height_px as f64 / uploaded.width_px as f64).ceil() as i32`. Update the SQL to also SET `grid_rows = ?`.

---

**File**: `apps/master-app/src-tauri/src/commands/maps.rs`

**New Command**: `update_map_grid_cols`

**Specific Changes**: 4. **Add grid slider command**: New Tauri command that accepts `map_id`, `campaign_id`, `grid_cols` (clamped 8–48). Derives `grid_rows` from current `width_px`/`height_px`. Clamps any out-of-bounds tokens. Persists and returns updated map.

---

**File**: `apps/player-activity/src/features/tabletop/TabletopPlayerView.tsx` (and parent)

**Specific Changes**: 5. **Read active map from store, not just props**: The `TabletopPlayerView` should read the active map from the tabletop store's `maps[]` array (falling back to the prop). This ensures that when a `map.updated` event updates the store, the component re-renders with the new map data (including fresh `backgroundPublicPath` and updated `gridRows`).

---

**File**: `packages/ui/src/tabletop-board-styles.ts`

**Function**: `buildTabletopBoardStyles`

**Specific Changes**: 6. **Align board aspect ratio with grid**: The `--grid-aspect-ratio` CSS variable should use `gridCols / gridRows` (via the updated `tabletopBoardAspectRatio`). This is already handled by change #2 above, but verify the CSS variable flows correctly to both `.tabletop-board` and `.tabletop-board__grid`.

---

**File**: `apps/master-app/src/features/tabletop-control/` (new component)

**Specific Changes**: 7. **Grid size slider UI**: Add a slider component (range 8–48, step 1) that calls the new `update_map_grid_cols` Tauri command. After success, bump the tabletop snapshot so the player-activity picks up the change. Use i18n keys for labels.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests for `tabletopBoardAspectRatio` and `deriveGridRows` (once created) that demonstrate the mismatch between image aspect ratio and grid aspect ratio on unfixed code. Write integration tests for the player-activity store that show `map.updated` events don't propagate to the view.

**Test Cases**:

1. **Portrait Image Grid Mismatch**: Call `tabletopBoardAspectRatio` with a portrait map (1080×1920, gridCols=24, gridRows=18). Observe that board aspect ratio is `1080/1920` but grid is `24/18` — mismatch proves non-square cells (will fail on unfixed code)
2. **Rust Command Missing gridRows**: Inspect `update_map_background` SQL — confirm `grid_rows` is not in the UPDATE SET clause (will fail on unfixed code)
3. **Player-Activity Stale Map Prop**: Dispatch a `map.updated` action to the store, verify that `TabletopPlayerView` still renders the old `backgroundPublicPath` from props (will fail on unfixed code)
4. **No Grid Slider Command**: Attempt to invoke `update_map_grid_cols` — command does not exist (will fail on unfixed code)

**Expected Counterexamples**:

- `tabletopBoardAspectRatio({imagePath: 'x', widthPx: 1080, heightPx: 1920})` returns `"1080 / 1920"` while grid is 24×18 → cells are `(1080/24) / (1920/18) ≈ 0.42` aspect ratio (not 1:1)
- Possible causes: missing `gridRows` derivation in Rust, aspect ratio function using pixel dimensions instead of grid dimensions

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL map WHERE hasBackground(map) AND widthPx > 0 AND heightPx > 0 DO
  derivedRows := deriveGridRows(map.gridCols, map.widthPx, map.heightPx)
  boardAspect := tabletopBoardAspectRatio(map)
  gridAspect := map.gridCols / derivedRows
  ASSERT boardAspect == `${map.gridCols} / ${derivedRows}`
  ASSERT abs(gridAspect - (map.widthPx / map.heightPx)) < 1/map.gridCols  // within one cell tolerance
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL map WHERE NOT hasBackground(map) DO
  ASSERT tabletopBoardAspectRatio_fixed(map) == tabletopBoardAspectRatio_original(map)
  ASSERT tabletopBoardAspectRatio_fixed(map) == '4 / 3'
END FOR

FOR ALL map WHERE hasBackground(map) AND widthPx >= heightPx DO
  derivedRows := deriveGridRows(map.gridCols, map.widthPx, map.heightPx)
  // Landscape: rows <= cols, cells still square
  ASSERT derivedRows <= map.gridCols
  ASSERT derivedRows > 0
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many random map configurations (varying widthPx, heightPx, gridCols) automatically
- It catches edge cases like very narrow images, square images, or extreme aspect ratios
- It provides strong guarantees that the default 4:3 behavior is unchanged for maps without backgrounds

**Test Plan**: Observe behavior on UNFIXED code first for maps without backgrounds and landscape maps, then write property-based tests capturing that behavior.

**Test Cases**:

1. **No-Background Preservation**: Verify that maps with empty `imagePath` and no `backgroundPublicPath` continue to return `'4 / 3'` aspect ratio and use 24×18 grid
2. **Landscape Preservation**: Verify that landscape maps (widthPx ≥ heightPx) produce square cells with the new derivation (gridCols/derivedRows ≈ widthPx/heightPx)
3. **Token Position Preservation**: Verify that tokens within bounds of the new grid remain at their original positions after a grid change
4. **Bench Token Preservation**: Verify that bench tokens are completely unaffected by grid dimension changes

### Unit Tests

- `deriveGridRows` returns correct values for portrait, landscape, and square images
- `deriveGridRows` returns default (18) when widthPx or heightPx is 0
- `tabletopBoardAspectRatio` returns `gridCols / gridRows` when background exists
- `tabletopBoardAspectRatio` returns `'4 / 3'` when no background
- `sessionAssetUrl` correctly resolves paths (existing tests, verify no regression)
- Token clamping logic for out-of-bounds positions after grid resize

### Property-Based Tests

- Generate random `(gridCols, widthPx, heightPx)` tuples and verify `deriveGridRows` always produces square cells (ratio tolerance < 1/gridCols)
- Generate random maps without backgrounds and verify aspect ratio is always `'4 / 3'`
- Generate random token positions and grid changes, verify clamping preserves valid positions and clamps invalid ones
- Generate random `gridCols` values (8–48) with random image dimensions and verify `gridRows` is always positive and produces a valid grid

### Integration Tests

- Full flow: upload portrait image → verify `gridRows` is recalculated in DB → verify snapshot contains updated map → verify player-activity renders square cells
- Full flow: change background mid-session → verify `map.updated` event propagates → verify player-activity renders new background
- Full flow: adjust grid slider → verify `gridCols` persists → verify `gridRows` derived → verify snapshot re-published → verify player-activity updates
- Full flow: first join → verify background renders immediately after first snapshot
