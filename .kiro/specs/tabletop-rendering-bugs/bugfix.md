# Bugfix Requirements Document

## Introduction

Four rendering bugs affect the tabletop when a portrait (vertical) background image is used, and when the Discord Activity loads or refreshes during a session. Together they break the visual fidelity of the tactical board: portrait images are squashed into landscape proportions, grid cells become rectangular instead of square, the player-activity starts with a blank board, and mid-session background changes may show a stale cached image instead of the freshly uploaded one. As part of this fix, the GM gains a slider control to adjust grid cell size (number of columns), which drives the automatic row count derivation that keeps cells square.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the GM uploads a portrait-oriented background image (heightPx > widthPx) THEN the system stores the correct `widthPx` and `heightPx` in the map record but does NOT recalculate `gridRows`, leaving it at the default value (18), so the board aspect ratio is portrait while the grid remains landscape-proportioned (24×18)

1.2 WHEN a map has a portrait background and the grid is rendered with fixed `gridCols` (24) and unchanged `gridRows` (18) THEN the system produces rectangular (non-square) grid cells because the board aspect ratio (e.g. 1080/1920) does not match the grid ratio (24/18), squashing the visualization horizontally

1.3 WHEN the player-activity Discord Activity loads for the first time and the first HTTP poll returns a snapshot with the active map THEN the system renders the board with an empty/blank background because the `backgroundPublicPath` URL is not resolved or the snapshot has not yet been published by the master-app

1.4 WHEN the GM changes the background image during a session and the new `backgroundPublicPath` is delivered via `map.updated` THEN the Discord Activity browser may serve the OLD cached image because the URL lacks a cache-busting suffix and CloudFront/browser HTTP caching returns stale content

1.5 WHEN the GM wants to adjust the grid density (cell size) on a map THEN the system provides no UI control to change `gridCols`, forcing the GM to accept the hardcoded default of 24 columns regardless of map size or play style

### Expected Behavior (Correct)

2.1 WHEN the GM uploads a portrait-oriented background image (heightPx > widthPx) THEN the system SHALL recalculate `gridRows` as `ceil(gridCols × heightPx / widthPx)` so that the grid ratio matches the image aspect ratio and cells remain square

2.2 WHEN a map has any background image (portrait or landscape) THEN the system SHALL ensure grid cells are always square by deriving `gridRows` from `gridCols` and the image aspect ratio, so that `gridCols / gridRows ≈ widthPx / heightPx`

2.3 WHEN the player-activity Discord Activity loads and receives the first snapshot containing an active map with a `backgroundPublicPath` THEN the system SHALL immediately render the background image without requiring additional polls or user interaction

2.4 WHEN the GM changes the background image during a session THEN the system SHALL ensure the new image URL is unique (e.g. by appending a content hash or version query parameter) so that the browser and CDN serve the fresh image instead of a stale cached version

2.5 WHEN the GM adjusts the grid size slider in the master-app THEN the system SHALL update `gridCols` to the chosen value (within reasonable bounds, e.g. 8–48) and automatically recalculate `gridRows` from the image aspect ratio to keep cells square

2.6 WHEN the GM changes `gridCols` via the slider during a live session THEN the system SHALL persist the new grid dimensions, publish a `map.updated` event so the player-activity reflects the change in real time, and re-publish the tabletop snapshot

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a map has a landscape-oriented background (widthPx ≥ heightPx) THEN the system SHALL CONTINUE TO render the board with the correct aspect ratio and square grid cells (gridCols / gridRows ≈ widthPx / heightPx)

3.2 WHEN a map has no background image (`imagePath` is empty and `backgroundPublicPath` is absent) THEN the system SHALL CONTINUE TO use the default 4:3 aspect ratio and default grid dimensions (24×18)

3.3 WHEN tokens are on the board THEN the system SHALL CONTINUE TO render them as circles regardless of the background orientation

3.4 WHEN tokens are on the bench THEN the system SHALL CONTINUE TO render them at fixed size (2.5rem) with circular shape

3.5 WHEN the GM activates a different map (`map.activated`) THEN the system SHALL CONTINUE TO switch to the new map and render its background correctly

3.6 WHEN the master-app publishes a tabletop snapshot THEN the system SHALL CONTINUE TO include all map data (including `backgroundPublicPath`) in the snapshot payload so the player-activity can render the full state on first load

3.7 WHEN the session ends THEN the system SHALL CONTINUE TO reset tabletop state to initial and clear any cached background references

3.8 WHEN existing tokens are positioned on the board and the GM changes grid density THEN the system SHALL CONTINUE TO preserve token positions (clamping any out-of-bounds positions to the new grid boundaries)
