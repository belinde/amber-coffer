# Requirements Document

## Introduction

Currently the Game Master must keep an image preview modal open to share an image with players on the tabletop. Once the modal is closed, the handout is automatically hidden. This feature decouples image visibility from the preview modal, allowing the GM to enable multiple images simultaneously on the tabletop, manage their visibility from a dedicated control panel in the session page, and continue other operations without interruption.

## Glossary

- **Master_App**: The desktop application (Tauri 2 + React) used by the Game Master to manage campaigns, sessions, and the tabletop.
- **Player_Activity**: The Discord Activity (React) that renders the tactical tabletop for players; stateless viewer synced via HTTP polling.
- **Handout**: An image or document the GM shares with players during a session, identified by a branded `HandoutId` (UUID v7), stored in SQLite with a `visibleToPlayers` boolean flag.
- **Tabletop_Snapshot**: The full state payload (`tabletop.snapshot` kind) published via HTTP sync, containing maps, tokens, and `visibleHandouts` array consumed by the Player_Activity.
- **Image_Gallery**: The campaign image browsing view in Master_App, accessible from the vault navigation.
- **Active_Images_Panel**: A new UI section in the session tabletop area that lists all currently visible Handouts and provides toggle controls to show/hide each one independently.
- **Session_Tabletop_Section**: The existing tabletop control area within the session detail view (live and post phases), hosting map selection, token management, and grid controls.
- **Image_Preview_Modal**: The existing full-size image preview overlay that currently triggers show/hide actions for a single image.

## Requirements

### Requirement 1: Decouple Image Visibility from Preview Modal

**User Story:** As a Game Master, I want showing an image to players to persist independently of the preview modal, so that I can close the modal and continue my workflow while the image remains visible on the tabletop.

#### Acceptance Criteria

1. WHEN the GM clicks "Show to Players" in the Image_Preview_Modal, THE Master_App SHALL create or update the Handout record with `visibleToPlayers: true`, publish an updated Tabletop_Snapshot, and indicate visually within the modal that the image is now shared.
2. WHEN the GM closes the Image_Preview_Modal after having shown an image, THE Master_App SHALL keep the Handout `visibleToPlayers` state unchanged (the image remains visible to players).
3. WHILE a Handout has `visibleToPlayers: true`, THE Player_Activity SHALL continue rendering the image regardless of whether the Image_Preview_Modal is open or closed in the Master_App.
4. WHEN the GM re-opens the Image_Preview_Modal for an image that is already visible to players, THE Master_App SHALL display the "Hide from Players" action instead of "Show to Players".
5. WHEN the GM clicks "Hide from Players" in the Image_Preview_Modal, THE Master_App SHALL set `visibleToPlayers: false` on the Handout record, remove it from the `visibleHandouts` array, publish an updated Tabletop_Snapshot, and update the modal to display the "Show to Players" action.
6. IF the Tabletop_Snapshot publish fails when toggling Handout visibility, THEN THE Master_App SHALL revert the `visibleToPlayers` state to its previous value and display an error message indicating the visibility change could not be synced.

### Requirement 2: Multiple Simultaneous Visible Images

**User Story:** As a Game Master, I want to show multiple images to players at the same time, so that I can present maps, portraits, and reference art simultaneously during play.

#### Acceptance Criteria

1. THE Master_App SHALL allow multiple Handout records to have `visibleToPlayers: true` simultaneously within the same session.
2. WHEN the GM shows a new image to players, THE Master_App SHALL set `visibleToPlayers: true` and record the current timestamp in `shownAt` on the Handout, add it to the `visibleHandouts` array in the Tabletop_Snapshot without removing previously visible Handouts, and publish the updated snapshot.
3. THE Tabletop_Snapshot `visibleHandouts` array SHALL contain all Handouts with `visibleToPlayers: true` for the active session, ordered by `shownAt` ascending (oldest first), with no upper bound enforced by the schema.
4. THE Player_Activity SHALL render all entries in the `visibleHandouts` array simultaneously, displaying each image in the order received from the snapshot within a scrollable or grid layout.
5. IF the GM triggers "Show to Players" on an image whose Handout already has `visibleToPlayers: true`, THEN THE Master_App SHALL take no action and leave the existing visibility state and `shownAt` timestamp unchanged.

### Requirement 3: Active Images Control Panel in Session View

**User Story:** As a Game Master, I want a dedicated panel in the session page showing all currently visible images, so that I can manage which images players see without navigating away from the session workflow.

#### Acceptance Criteria

1. WHILE at least one Handout for the active session has `visibleToPlayers: true`, THE Master_App SHALL display the Active_Images_Panel within the Session_Tabletop_Section.
2. THE Active_Images_Panel SHALL list each visible Handout showing its label and a thumbnail preview of its image, ordered by `shownAt` ascending (earliest-shown first).
3. IF a visible Handout has no `image` field, THEN THE Active_Images_Panel SHALL display the Handout label as a text placeholder in place of the thumbnail.
4. WHEN the GM clicks the hide action on a Handout in the Active_Images_Panel, THE Master_App SHALL set `visibleToPlayers: false` on that Handout record, remove it from the `visibleHandouts` array in the next Tabletop_Snapshot, and publish the updated snapshot.
5. IF the hide action fails (database write or snapshot publish error), THEN THE Master_App SHALL retain the Handout in the Active_Images_Panel unchanged and display an inline error message indicating the operation failed.
6. WHEN the last visible Handout is hidden, THE Active_Images_Panel SHALL be hidden from the session view.
7. THE Active_Images_Panel SHALL refresh its list within 5000 ms of any change to Handout visibility (whether triggered from the panel itself, the Image_Preview_Modal, or the Image_Gallery).

### Requirement 4: Show Image from Gallery During Live Session

**User Story:** As a Game Master, I want to share images directly from the campaign image gallery without opening the full preview, so that I can quickly enable images and return to the session flow.

#### Acceptance Criteria

1. WHILE a session is in the "live" play state, THE Image_Gallery SHALL display a "Show to Players" action on each image entry.
2. WHEN the GM triggers "Show to Players" from the Image_Gallery, THE Master_App SHALL create a Handout for that image using the gallery image name as the Handout label, set `visibleToPlayers: true`, publish an updated Tabletop_Snapshot, and switch the triggered action to display "Hide from Players" within 500 ms of successful completion.
3. WHILE an image is already visible to players (a Handout with `visibleToPlayers: true` exists for it), THE Image_Gallery SHALL display a "Hide from Players" action instead of "Show to Players" for that image entry.
4. WHEN the GM triggers "Hide from Players" from the Image_Gallery, THE Master_App SHALL set `visibleToPlayers: false` on the associated Handout, publish an updated Tabletop_Snapshot, and switch the triggered action back to display "Show to Players" within 500 ms of successful completion.
5. IF no session is live (play state is not "live"), THEN THE Image_Gallery SHALL NOT display "Show to Players" or "Hide from Players" actions.
6. IF the show or hide operation fails (database write error or snapshot publish failure), THEN THE Master_App SHALL leave the action button in its previous state and display an error message indicating that the visibility change could not be applied.

### Requirement 5: Player-Side Multi-Image Display

**User Story:** As a player, I want to see all images the GM has shared arranged clearly on the tabletop interface, so that I can reference multiple visual aids during gameplay.

#### Acceptance Criteria

1. WHEN the `visibleHandouts` array in the Tabletop_Snapshot contains one or more entries, THE Player_Activity SHALL render a dedicated handout display area showing all visible images.
2. WHEN the player clicks or taps a Handout thumbnail in the handout display area, THE Player_Activity SHALL expand that image to fill the available viewport width (up to the image's native resolution), overlaying or replacing the thumbnail view.
3. WHILE no entries exist in the `visibleHandouts` array, THE Player_Activity SHALL hide the handout display area entirely to maximize the tabletop viewport.
4. WHEN a Handout is removed from the `visibleHandouts` array in a subsequent snapshot, THE Player_Activity SHALL remove it from the display within the next poll cycle (2000 ms).
5. IF a Handout image fails to load (network error or HTTP error on the resolved URL), THEN THE Player_Activity SHALL display the Handout `label` field as a text placeholder instead of a broken image indicator.
6. IF a Handout entry has no `image` field or its `image` object contains neither `thumbnailUrl` nor `canonUrl`, THEN THE Player_Activity SHALL display the Handout `label` field as a text placeholder.
7. THE Player_Activity SHALL resolve Handout image URLs as follows: use `image.thumbnailUrl` for the thumbnail rendering, and `image.canonUrl` for the expanded view; if only one URL is present, use it for both renderings.

### Requirement 6: Hide All Images Action

**User Story:** As a Game Master, I want a single action to hide all shared images at once, so that I can quickly clear the tabletop when moving to a new scene.

#### Acceptance Criteria

1. WHILE two or more Handouts are visible to players, THE Active_Images_Panel SHALL display a "Hide All" action.
2. WHEN the GM triggers "Hide All", THE Master_App SHALL atomically set `visibleToPlayers: false` on all Handouts for the active session, publish an updated Tabletop_Snapshot with an empty `visibleHandouts` array, and hide the Active_Images_Panel within 1000 ms of the user action.
3. WHILE fewer than two Handouts are visible, THE Active_Images_Panel SHALL NOT display the "Hide All" action.
4. IF the "Hide All" operation fails to update one or more Handout records, THEN THE Master_App SHALL leave all Handout visibility states unchanged (no partial hide), display an error message indicating the operation failed, and keep the Active_Images_Panel visible with its previous state.
