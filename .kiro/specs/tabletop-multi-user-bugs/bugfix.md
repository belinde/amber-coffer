# Bugfix Requirements Document

## Introduction

Three related bugs manifest during multi-user tabletop sessions in the Player Activity Discord Activity. Together they degrade the core play experience: tokens jump unpredictably when multiple participants are present, background image changes after the first one are silently lost, and portrait-oriented backgrounds distort tokens into ellipses. All three share a common theme — the sync and rendering pipeline was only validated with a single participant and a landscape background.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN multiple participants are in the activity AND a player moves a token THEN the system overwrites all token positions with a stale server snapshot on the next poll cycle, causing other tokens to jump to outdated positions

1.2 WHEN the HTTP poll client receives a response containing `pendingEvents` THEN the system ignores the incremental events array entirely, discarding confirmed token movements and other state deltas

1.3 WHEN the GM changes the background image on the currently active map (same `activeMapId`) THEN the system does not update the map object in state because `map.updated` messages are unhandled, leaving the previous background displayed indefinitely

1.4 WHEN a map has a portrait-oriented background (height > width, e.g. 1080×1920) THEN the system renders tokens as vertically elongated ellipses instead of circles, because both explicit `width` and `height` on `.tabletop-token` override the `aspect-ratio: 1` declaration when grid cells are non-square

### Expected Behavior (Correct)

2.1 WHEN multiple participants are in the activity AND a player moves a token THEN the system SHALL apply incremental `pendingEvents` from the poll response and reconcile them with optimistic local state so that token positions reflect the latest confirmed server state without reverting in-flight moves

2.2 WHEN the HTTP poll client receives a response containing `pendingEvents` THEN the system SHALL iterate over each event, parse it as an `MqttMessage`, and dispatch it to the appropriate store handler before processing any full snapshot

2.3 WHEN the GM changes the background image on the currently active map THEN the system SHALL handle the `map.updated` message by replacing the corresponding map object in state, causing the board to re-render with the new `backgroundPublicPath`

2.4 WHEN a map has a portrait-oriented background (height > width) THEN the system SHALL render tokens as circles by constraining token dimensions so that `aspect-ratio: 1` is honoured regardless of grid cell shape

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a single participant is in the activity AND moves a token THEN the system SHALL CONTINUE TO apply the optimistic local update immediately and reflect the final position after server confirmation

3.2 WHEN the HTTP poll client receives a full snapshot (e.g. on first join or reconnect) AND no local optimistic moves are pending THEN the system SHALL CONTINUE TO replace the entire tabletop state with the snapshot

3.3 WHEN the GM activates a different map (`map.activated`) THEN the system SHALL CONTINUE TO switch `activeMapId` and render the new map's background correctly

3.4 WHEN a map has a landscape-oriented background (width ≥ height) THEN the system SHALL CONTINUE TO render tokens as circles within square grid cells

3.5 WHEN tokens are on the bench THEN the system SHALL CONTINUE TO render them at fixed size (2.5rem) with circular shape regardless of board aspect ratio

3.6 WHEN the session ends THEN the system SHALL CONTINUE TO reset tabletop state to initial and notify session-ended listeners
