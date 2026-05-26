# Implementation Plan

## Overview

Bugfix implementation for tabletop rendering issues: non-square grid cells on portrait background upload, stale/missing background on player-activity, and missing grid size slider. Follows the exploratory bugfix workflow: write tests before fix, preserve existing behavior, implement fix, validate.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Non-Square Grid Cells on Background Upload
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the grid/image aspect ratio mismatch
  - **Scoped PBT Approach**: Use fast-check to generate random `(gridCols, widthPx, heightPx)` tuples where `widthPx > 0` and `heightPx > 0`, then verify that `tabletopBoardAspectRatio` returns `gridCols / gridRows` (where `gridRows = ceil(gridCols * heightPx / widthPx)`) instead of `widthPx / heightPx`
  - Test file: `packages/shared/src/tabletop/board-aspect-ratio.spec.ts`
  - Import current `tabletopBoardAspectRatio` from `./board-aspect-ratio.ts`
  - Generate maps with `imagePath: 'bg.webp'` (non-empty), random `widthPx` (100-4000), random `heightPx` (100-4000), `gridCols` (8-48)
  - Assert: for maps with background, result equals `${gridCols} / ${Math.ceil(gridCols * heightPx / widthPx)}` (expected after fix)
  - On UNFIXED code: `tabletopBoardAspectRatio` returns `${widthPx} / ${heightPx}` which does NOT match `gridCols / gridRows` for most inputs
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists: aspect ratio uses pixel dimensions instead of grid dimensions)
  - Document counterexamples found
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Default Grid and No-Background Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `packages/shared/src/tabletop/board-aspect-ratio.preservation.spec.ts`
  - Write property-based test with fast-check: for all maps where `imagePath` is empty AND `backgroundPublicPath` is absent/empty, `tabletopBoardAspectRatio` returns `'4 / 3'` (the `DEFAULT_TABLETOP_BOARD_ASPECT_RATIO`)
  - Generate maps with `imagePath: ''`, `backgroundPublicPath: undefined or ''`, random `widthPx`, `heightPx`, `gridCols`, `gridRows`
  - Assert: result always equals `'4 / 3'`
  - Additionally test: `tabletopGridAspectRatio(gridCols, gridRows)` returns `${gridCols} / ${gridRows}` for positive values and `'4 / 3'` for zero/negative
  - Verify tests PASS on UNFIXED code (confirms baseline behavior to preserve)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Add `deriveGridRows` utility
  - File: `packages/shared/src/tabletop/defaults.ts`
  - Add: `export function deriveGridRows(gridCols: number, widthPx: number, heightPx: number): number`
  - Returns `Math.ceil(gridCols * heightPx / widthPx)` when both `widthPx > 0` and `heightPx > 0`
  - Returns `TABLETOP_GRID_ROWS` (18) when either dimension is zero or negative
  - Export from `packages/shared/src/tabletop/index.ts` (or barrel)
  - _Requirements: 2.1, 2.2, 2.5_

- [x] 4. Fix `tabletopBoardAspectRatio` to use grid dimensions
  - File: `packages/shared/src/tabletop/board-aspect-ratio.ts`
  - Change function signature to accept `gridCols` and `gridRows` (add to the Pick type)
  - When background exists and dimensions are positive: return `${map.gridCols} / ${map.gridRows}` instead of `${map.widthPx} / ${map.heightPx}`
  - When no background: continue returning `DEFAULT_TABLETOP_BOARD_ASPECT_RATIO` ('4 / 3')
  - Update `TabletopMapLayout` type in `packages/ui/src/tabletop-board-styles.ts` if needed
  - _Requirements: 2.1, 2.2, 3.1, 3.2_

- [x] 5. Update `update_map_background` Rust command to recalculate `grid_rows`
  - File: `apps/master-app/src-tauri/src/commands/maps.rs`
  - After obtaining `uploaded.width_px` and `uploaded.height_px`, compute: `let grid_rows = (existing.grid_cols as f64 * uploaded.height_px as f64 / uploaded.width_px as f64).ceil() as i32;`
  - Update the SQL UPDATE statement to include `grid_rows = ?` in the SET clause
  - Bind the new `grid_rows` value in the query
  - _Requirements: 1.1, 2.1, 2.2_

- [x] 6. Add `update_map_grid_cols` Tauri command
  - File: `apps/master-app/src-tauri/src/commands/maps.rs`
  - New command: `pub async fn update_map_grid_cols(map_id, campaign_id, session_id, grid_cols)` returning `Result<Map, AppError>`
  - Clamp `grid_cols` to range 8-48
  - Derive `grid_rows` from current `width_px`/`height_px` using same formula
  - Clamp any tokens with `position.zone == 'board'` where `xCell >= new_grid_cols` or `yCell >= new_grid_rows`
  - Persist updated `grid_cols`, `grid_rows`, bump `version`, update `updated_at`
  - Register command in Tauri app builder
  - _Requirements: 2.5, 2.6, 3.8_

- [x] 7. Add bridge function for `update_map_grid_cols` in master-app
  - File: `apps/master-app/src/bridge/maps.ts`
  - Add Zod schema `updateMapGridColsInputSchema` with `mapId`, `campaignId`, `sessionId`, `gridCols` (number 8-48)
  - Add `export async function updateMapGridCols(input): Promise<Map>` that invokes the new Tauri command
  - _Requirements: 2.5, 2.6_

- [x] 8. Fix `TabletopPlayerView` to read active map from store state
  - File: `apps/player-activity/src/features/tabletop/TabletopPlayerView.tsx`
  - Read the active map from `state.maps` using `state.activeMapId` (or fall back to the `map` prop)
  - This ensures `map.updated` events that update the store's `maps[]` array are reflected immediately
  - The component will re-render with fresh `backgroundPublicPath` and updated `gridRows`/`gridCols`
  - _Requirements: 1.3, 1.4, 2.3, 2.4_

- [x] 9. Add grid size slider UI component in master-app
  - File: `apps/master-app/src/features/tabletop-control/grid-size-slider.tsx` (new)
  - Range input: min=8, max=48, step=1, default from current `map.gridCols`
  - Use `useTranslation()` for label (key: `tabletop.gridSize.label`)
  - On change: call `updateMapGridCols` bridge function
  - After success: call `bumpTabletopSnapshot()` to force immediate re-publish
  - Integrate into `TabletopControlView` or parent session panel
  - Accessibility: `aria-label`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`
  - _Requirements: 2.5, 2.6, 3.8_

- [x] 10. Bump tabletop snapshot after grid change
  - File: `apps/master-app/src/features/tabletop-control/tabletop-sync-bump.ts` (existing)
  - Ensure `bumpTabletopSnapshot()` is called after successful `updateMapGridCols` (in slider handler)
  - This invalidates the cached snapshot hash so the next poll publishes the updated map immediately
  - _Requirements: 2.6_

- [x] 11. Verify bug condition exploration test now passes
  - **Property 1: Expected Behavior** - Non-Square Grid Cells Fixed
  - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
  - The test from task 1 encodes the expected behavior (`tabletopBoardAspectRatio` returns `gridCols / gridRows`)
  - When this test passes, it confirms the expected behavior is satisfied
  - Run bug condition exploration test from step 1
  - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
  - _Requirements: 2.1, 2.2_

- [x] 12. Verify preservation tests still pass
  - **Property 2: Preservation** - Default Grid and No-Background Behavior Unchanged
  - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
  - Run preservation property tests from step 2
  - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
  - Confirm all tests still pass after fix (no regressions)

- [x] 13. Checkpoint - Ensure all tests pass
  - Run `pnpm test` to verify all unit and property-based tests pass
  - Run `pnpm typecheck` to verify no type errors across the monorepo
  - Run `pnpm lint` to verify no lint violations
  - Run `cargo check` in `apps/master-app/src-tauri` to verify Rust compiles
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Property-based tests use `fast-check` (already available in the monorepo via vitest)
- The Rust command changes require `cargo check` validation in addition to TypeScript tests
- The grid slider UI requires i18n keys to be added to translation files
- Token clamping in `update_map_grid_cols` must handle both board and bench zones (bench tokens are never clamped)
