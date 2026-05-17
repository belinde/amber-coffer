# `@amber/tabletop-engine`

Pure functions for the Amber Coffer tabletop: cell-based geometry, occupancy resolution, snapshot/state reducer.

Used by:

- `apps/master-app` (authoritative control view)
- `apps/player-activity` (read-only viewer)

Decision recorded in [`docs/migration/tabletop-porting-notes.md`](../../docs/migration/tabletop-porting-notes.md) (D7: separate package rather than `@amber/shared` or duplicated code).

## Modules

| Module | Exports |
|--------|---------|
| `geometry` | `pxToBoardCell`, `pxToBenchSlot`, `boardCellToPercent`, `benchSlotToPercent`, `nearestFreeBoardCell`, `nearestFreeBenchSlot`, `cellKey`, `positionKey`, `BENCH_SLOTS_DEFAULT` |
| `state` | `initialTabletopState`, `tabletopReducer`, action creators (`token.moved`, `token.created`, `token.removed`, `handout.shown`, `handout.hidden`, `snapshot.applied`) |

## Origin

Geometry functions are ports — under the licence of the original POC — of `_readonly/legacy-cloud/apps/web/src/components/TabletopBoard.tsx` (lines 23–110), adapted to cell coordinates with `bench` zone (decisions D1, D2).
