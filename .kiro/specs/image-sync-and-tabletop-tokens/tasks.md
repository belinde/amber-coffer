# Implementation Plan: Image Sync and Tabletop Tokens

## Overview

This plan implements the full image synchronization pipeline from local SQLite/filesystem to S3 via presigned URLs, square token portrait clipping, map background selection, player-activity header simplification, and token portrait rendering. The implementation spans Rust services (image processing, sync orchestration), AWS CDK infrastructure (Lambdas, API Gateway routes), shared TypeScript types, and React UI components in both master-app and player-activity.

## Tasks

- [x] 1. Shared types and schemas
  - [x] 1.1 Create ClipRegion Zod schema and TypeScript type
    - Create `packages/shared/src/world-state/clip-region.schema.ts`
    - Define `clipRegionSchema` with `centerX`, `centerY`, `halfSide` fields and bounds-check refinement
    - Export `ClipRegion` type
    - _Requirements: 4.1, 4.2_

  - [x] 1.2 Extend ImageRef type with `tokenPortraitUrl` field
    - Add optional `tokenPortraitUrl` field to the existing `ImageRef` type in `packages/shared`
    - Update the corresponding Zod schema
    - _Requirements: 1.5, 7.2_

  - [x] 1.3 Create ManifestEntry schema
    - Create `packages/shared/src/sync/manifest-entry.schema.ts`
    - Define `manifestEntrySchema` with `key` and `etag` string fields
    - Export `ManifestEntry` type
    - _Requirements: 2.1, 3.1_

  - [x] 1.4 Extend tabletop snapshot schema with `tokenPortraitUrls`
    - Add `tokenPortraitUrls: z.record(z.string(), z.string().url()).default({})` to `tabletopSnapshotSchema`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 1.5 Write property tests for shared schemas (fast-check)
    - **Property 4: CloudFront URL Construction** — For any valid CampaignId and CampaignImageId, constructed URLs follow the expected pattern
    - **Property 6: UUID v7 Validation** — For any string, UUID v7 validation accepts iff format matches RFC 9562 v7
    - **Property 8: ClipRegion Validation** — For any (centerX, centerY, halfSide) triple, validation accepts iff bounds constraints hold
    - **Property 9: Grid Rows Derivation** — For any positive (widthPx, heightPx, gridCols), derived gridRows = max(1, round(gridCols × heightPx / widthPx))
    - **Property 11: Tabletop Snapshot Serialization Round-Trip** — For any valid snapshot with tokenPortraitUrls, serialize→parse produces deep-equal result
    - **Validates: Requirements 1.5, 3.3, 4.1, 5.4, 7.1**

- [x] 2. SQLite migration and Rust data models
  - [x] 2.1 Create SQLite migration for clip_region and sync tracking
    - Create new migration file in `apps/master-app/src-tauri/migrations/`
    - Add `clip_region_json TEXT` column to `campaign_images`
    - Add `s3_etag TEXT` and `last_uploaded_hash TEXT` columns to `campaign_images`
    - Create `image_sync_state` table with `campaign_id`, `last_synced_at`, `last_sync_status`
    - _Requirements: 4.2, 2.3, 2.7_

  - [x] 2.2 Define Rust ClipRegion struct with validation
    - Create `ClipRegion` struct in `src-tauri/src/models/` (or appropriate module)
    - Implement `serde` Serialize/Deserialize with `camelCase` rename
    - Implement `validate()` method enforcing bounds constraints
    - _Requirements: 4.1, 4.2_

  - [x] 2.3 Define Rust ManifestEntry and SyncAction types
    - Create `ManifestEntry` struct (key, etag)
    - Create `SyncAction` enum/struct for sync diff results
    - Create `SyncReport` and `SyncProgress` structs for reporting
    - _Requirements: 2.1, 2.2_

  - [x] 2.4 Write Rust proptest for ClipRegion validation
    - **Property 8: ClipRegion Validation on CampaignImage**
    - Generate random (center_x, center_y, half_side) in [0.0, 1.0] and verify validation accepts iff all bounds hold
    - **Validates: Requirements 4.1, 4.2**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Rust Image Processing service
  - [x] 4.1 Implement `convert_to_webp` function
    - Create `apps/master-app/src-tauri/src/services/image_processing.rs`
    - Implement WebP conversion with max 4096px edge, Lanczos3 downscale
    - Use the `image` crate (already a dependency)
    - Return `(Vec<u8>, u32, u32)` — bytes, width, height
    - _Requirements: 1.4_

  - [x] 4.2 Implement `generate_thumbnail` function
    - Resize to fit within 256×256 maintaining aspect ratio
    - Encode as WebP
    - _Requirements: 1.4_

  - [x] 4.3 Implement `generate_token_portrait` function
    - Extract square region from ClipRegion (center ± halfSide relative to min(w,h))
    - Resize to exactly 128×128 pixels
    - Encode as WebP
    - _Requirements: 1.4, 4.3_

  - [x] 4.4 Write Rust proptest for image variant generation
    - **Property 3: Image Variant Generation**
    - For any valid image dimensions and optional ClipRegion, verify exactly 2 variants (no clip) or 3 variants (with clip), with correct output dimensions
    - **Validates: Requirements 1.4, 4.3**

- [x] 5. Rust Image_Sync_Service
  - [x] 5.1 Implement `should_skip_sync` function
    - Compare `lastSyncedAt` against max `updatedAt` of all campaign images
    - Return true iff lastSyncedAt > max(updatedAt)
    - _Requirements: 2.4_

  - [x] 5.2 Implement `fetch_manifest` function
    - HTTP GET to `/campaign/{id}/images/manifest` with Bearer token
    - Parse JSON response into `Vec<ManifestEntry>`
    - Handle timeout (10s) and HTTP errors
    - _Requirements: 2.1, 2.6_

  - [x] 5.3 Implement `compute_sync_diff` function
    - Compare local CampaignImage records against manifest entries
    - Flag images whose key is absent from manifest OR whose local hash differs from `last_uploaded_hash`
    - Return `Vec<SyncAction>`
    - _Requirements: 2.2, 1.3_

  - [x] 5.4 Implement `request_presigned_urls` function
    - POST to `/campaign/{id}/images/presigned-urls` with batch of keys (max 50)
    - Parse response into `HashMap<String, String>` (key → presigned URL)
    - Handle timeout (10s) and HTTP errors
    - _Requirements: 9.1, 9.6, 9.7_

  - [x] 5.5 Implement `upload_via_presigned_url` with retry logic
    - HTTP PUT with image bytes and `Content-Type: image/webp`
    - Retry up to 3 times with exponential backoff (1s, 2s, 4s)
    - Log errors with `tracing::warn!` on final failure
    - _Requirements: 1.6, 9.6_

  - [x] 5.6 Implement `sync_campaign_images` orchestrator function
    - Create `apps/master-app/src-tauri/src/services/image_sync.rs`
    - Orchestrate: skip check → manifest fetch → diff → batch presigned URLs → process variants → upload → update DB
    - Send progress via optional `mpsc::Sender<SyncProgress>`
    - Update `lastSyncedAt` and `last_uploaded_hash` / `s3_etag` on success
    - Store `thumbnailUrl`, `canonUrl`, `tokenPortraitUrl` in ImageRef after upload
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.7_

  - [x] 5.7 Write Rust proptests for sync logic
    - **Property 1: SHA-256 Hash Idempotence** — For any byte sequence, SHA-256 computed twice produces identical 64-char hex strings
    - **Property 2: Sync Diff Correctness** — For any image list + manifest, diff flags image iff key absent OR hash differs from last_uploaded_hash
    - **Property 5: Skip-Sync Predicate** — For any lastSyncedAt and set of updatedAt values, should_skip_sync returns true iff lastSyncedAt > max(updatedAt)
    - **Validates: Requirements 1.1, 1.3, 2.2, 2.4**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. CDK Infrastructure
  - [x] 7.1 Create Image Manifest Lambda function
    - Create `infrastructure/lambdas/image-manifest/src/handler.ts`
    - Implement GET handler: validate campaignId (UUID v7), verify HMAC Bearer token (role=master, campaignId match)
    - Call S3 ListObjectsV2 with `campaign-images/<campaignId>/` prefix, handle pagination
    - Return JSON array of `{ key, etag }` entries
    - Return appropriate HTTP error codes (400, 401, 403, 502)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 7.2 Create Presigned URL Lambda function
    - Create `infrastructure/lambdas/presigned-upload/src/handler.ts`
    - Implement POST handler: validate campaignId (UUID v7), validate keys array (non-empty, max 50)
    - Verify HMAC Bearer token (role=master, campaignId match)
    - Generate presigned PUT URLs valid for 15 minutes using S3 PutObject
    - Return JSON mapping each key to its presigned URL
    - Return appropriate HTTP error codes (400, 401, 403, 502)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 7.3 Add API Gateway routes and Lambda integrations in CDK stack
    - Add `GET /campaign/{campaignId}/images/manifest` route
    - Add `POST /campaign/{campaignId}/images/presigned-urls` route
    - Grant S3 ListObjectsV2 permission to manifest Lambda
    - Grant S3 PutObject + presign permission to presigned-upload Lambda
    - Both Lambdas target the existing `playerActivityBucket`
    - _Requirements: 3.2, 9.2_

  - [x] 7.4 Write CDK assertion tests
    - Verify manifest Lambda route exists at correct path
    - Verify presigned-upload Lambda route exists at correct path
    - Verify IAM permissions are correctly scoped
    - _Requirements: 3.2, 9.2_

  - [x] 7.5 Write property test for HMAC token auth verification
    - **Property 7: HMAC Token Auth Verification**
    - For any valid payload + secret, sign then verify succeeds; different secret or modified payload fails; role/campaignId mismatch → 403; missing/invalid → 401
    - **Validates: Requirements 3.4, 3.5, 9.3, 9.4**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Tauri commands
  - [x] 9.1 Implement `sync_campaign_images_cmd` Tauri command
    - Wire to `Image_Sync_Service::sync_campaign_images`
    - Emit Tauri events for progress updates (for React UI consumption)
    - Return `SyncReport` with counts of uploaded, skipped, failed
    - _Requirements: 1.2, 8.2, 8.3_

  - [x] 9.2 Implement `set_clip_region_cmd` Tauri command
    - Accept `campaign_image_id` and `Option<ClipRegion>`
    - Validate ClipRegion bounds before persisting
    - Persist `clip_region_json` on the CampaignImage record
    - When setting to None, clear clip_region_json (triggers token deletion on next sync)
    - _Requirements: 4.2, 4.8_

  - [x] 9.3 Implement `get_campaign_images_for_picker_cmd` Tauri command
    - Query all CampaignImage entries for the given campaign
    - Return `Vec<CampaignImagePickerEntry>` with id, title, thumbnail path, dimensions
    - _Requirements: 5.1, 5.2_

  - [x] 9.4 Implement `set_map_background_from_image_cmd` Tauri command
    - Read image dimensions from local file
    - Set `imagePath`, `widthPx`, `heightPx` on the map
    - Derive `gridRows = max(1, round(gridCols × heightPx / widthPx))`
    - Handle missing/unreadable file with error
    - _Requirements: 5.4, 5.5_

- [x] 10. React: Token Clip Editor component
  - [x] 10.1 Create TokenClipEditor component
    - Create `apps/master-app/src/features/tabletop/components/token-clip-editor.tsx`
    - Render CampaignImage with draggable/resizable square overlay
    - Constrain square to image bounds (center ± halfSide within 0..1)
    - Enforce minimum halfSide of 0.05
    - Live preview of cropped square result (update within 200ms)
    - Confirm button calls `set_clip_region_cmd`
    - Remove button clears ClipRegion
    - Disabled state with i18n message when no image assigned
    - Keyboard accessibility: arrow keys move center, +/- adjust halfSide
    - All strings via i18next (no hardcoded UI text)
    - _Requirements: 4.1, 4.2, 4.6, 4.7, 4.8_

  - [x] 10.2 Write unit tests for TokenClipEditor
    - Test disabled state when no image
    - Test bounds constraint enforcement
    - Test confirm/remove callbacks
    - _Requirements: 4.1, 4.6, 4.7_

- [x] 11. React: Map Background Picker component
  - [x] 11.1 Create MapBackgroundPicker component
    - Create `apps/master-app/src/features/tabletop/components/map-background-picker.tsx`
    - Fetch CampaignImage entries via `get_campaign_images_for_picker_cmd`
    - Display thumbnails in grid with titles
    - Empty state with i18n message when no images available
    - On selection: call `set_map_background_from_image_cmd`
    - "Upload new" button for adding new images
    - All strings via i18next
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7_

  - [x] 11.2 Write unit tests for MapBackgroundPicker
    - Test empty state rendering
    - Test selection callback
    - Test error handling for missing files
    - _Requirements: 5.3, 5.5_

- [x] 12. React: Manual Sync Button in image gallery
  - [x] 12.1 Implement Manual Sync Button and progress UI
    - Add sync button to image gallery view with i18n label
    - On click: invoke `sync_campaign_images_cmd`
    - Listen to Tauri progress events, show uploaded/total progress indicator
    - Disable button during sync
    - Show success notification with count on completion
    - Show warning notification with failed count on partial failure
    - Show error notification if manifest request fails
    - All strings via i18next
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_

- [x] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Player-Activity: Header simplification
  - [x] 14.1 Implement compact header for connected state
    - Extract `SessionHeader` component in `apps/player-activity/`
    - Connected state: icon (24×24) + campaign name (truncated 40 chars with ellipsis), max 48px height
    - Campaign name in heading element (`h2`) for accessibility
    - Non-connected states: full header with title and subtitle
    - Fallback i18n label when campaign name unavailable
    - Tabletop viewport uses `flex: 1` to fill remaining space
    - Hide app title, subtitle, and player Discord ID when connected
    - All strings via i18next
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 14.2 Write property test for campaign name truncation
    - **Property 10: Campaign Name Truncation**
    - For any string, if length > 40 display first 40 chars + "…", otherwise display unchanged
    - **Validates: Requirements 6.1**

  - [x] 14.3 Write unit tests for SessionHeader
    - Test correct elements rendered per session status (connected vs idle/connecting/ended/error)
    - Test heading role presence
    - Test fallback label when campaign name is null
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 15. Player-Activity: Token portrait rendering
  - [x] 15.1 Implement token portrait rendering on tabletop
    - When `tokenPortraitUrls[tokenId]` is present, render `<img>` with `border-radius: 50%` and `object-fit: cover`
    - On image load error: fall back to `tokenLabels[tokenId]` literal label
    - `alt` attribute uses token name for accessibility
    - When `tokenPortraitUrls` entry is absent, use existing literal-label fallback
    - _Requirements: 4.4, 4.5, 7.4_

  - [x] 15.2 Write unit tests for token portrait rendering
    - Test portrait image renders when URL present
    - Test fallback to label when URL absent
    - Test fallback on image load error
    - _Requirements: 4.4, 4.5, 7.4_

- [x] 16. Wire tokenPortraitUrls into snapshot push
  - [x] 16.1 Populate tokenPortraitUrls in tabletop snapshot
    - In the master-app snapshot generation logic, build `tokenPortraitUrls` record from tokens that have a Token_Portrait uploaded
    - Derive CloudFront URL from `tokenPortraitUrl` in ImageRef
    - Omit tokens without portraits from the record
    - Ensure updated URL appears within one poll cycle (2000ms) after upload completes
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

- [x] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (Rust: `proptest` crate; TypeScript: `fast-check`)
- Unit tests validate specific examples and edge cases
- Rust services use the `image` crate (already a dependency) for WebP processing
- All S3 uploads use presigned PUT URLs — no AWS credentials needed on the GM's machine
- UI components use `@amber/ui` design system primitives and i18next for all strings
- CDK Lambdas reuse existing HMAC token verification from session-sync endpoints

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "2.1"] },
    { "id": 1, "tasks": ["1.5", "2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4", "4.1", "4.2", "4.3"] },
    { "id": 3, "tasks": ["4.4", "5.1", "5.2", "5.3", "5.4", "5.5"] },
    { "id": 4, "tasks": ["5.6", "5.7", "7.1", "7.2"] },
    { "id": 5, "tasks": ["7.3", "7.4", "7.5"] },
    { "id": 6, "tasks": ["9.1", "9.2", "9.3", "9.4"] },
    { "id": 7, "tasks": ["10.1", "11.1", "12.1", "14.1"] },
    { "id": 8, "tasks": ["10.2", "11.2", "14.2", "14.3", "15.1"] },
    { "id": 9, "tasks": ["15.2", "16.1"] }
  ]
}
```
