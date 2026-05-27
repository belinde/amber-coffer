# Requirements Document

## Introduction

This feature introduces automatic S3 synchronization for all campaign images, square token clipping for Characters (PG) and NPCs (PNG), map background selection from existing images, and a streamlined tabletop UI layout. The master-app becomes the authoritative source for image upload orchestration, using checksums and timestamps for incremental sync. All S3 uploads use presigned URLs obtained from an API endpoint, removing the dependency on local AWS credentials. The player-activity gains token portrait rendering and a maximized play area.

## Glossary

- **Master_App**: The desktop application (Tauri 2 + React) used by the Game Master to manage campaigns, sessions, and the tabletop.
- **Player_Activity**: The Discord Activity (React) that renders the tactical tabletop for players; stateless viewer synced via HTTP polling.
- **Image_Sync_Service**: The Rust service in master-app responsible for uploading campaign images to S3 and tracking sync state.
- **Token_Clip_Editor**: The UI component in master-app that allows the GM to define a square crop region on a CampaignImage.
- **S3_Image_Bucket**: The AWS S3 bucket storing campaign images with path pattern `<CampaignId>/<ImageId>.webp`.
- **Image_Manifest_API**: The API Gateway + Lambda endpoint that returns the list of images currently stored on S3 for a given campaign.
- **CampaignImage**: An image entity in the local SQLite database, identified by a branded `CampaignImageId` (UUID v7).
- **Token_Portrait**: A square-cropped version of a CampaignImage (derived from its Clip_Region) used as the visual representation of the associated Character or NPC on the tabletop. Rendered with circular CSS clip (border-radius: 50%) for now, but stored as a square image to allow future shape changes.
- **Clip_Region**: A square area defined by center coordinates (centerX, centerY relative to image dimensions) and a half-side length (halfSide), stored on the CampaignImage record. When a CampaignImage is the primary image of a Character or NPC, the Clip_Region on that image determines the entity's Token_Portrait.
- **Presigned_URL_API**: The API Gateway + Lambda endpoint that accepts a list of S3 object keys and returns presigned PUT URLs for uploading campaign images, authenticated with the same master token used for session-sync endpoints.
- **Checksum**: SHA-256 hash of the image file content, used to detect modifications.
- **Manual_Sync_Button**: The UI control in the Master_App image gallery that triggers an on-demand full sync check of all campaign images against S3.

## Requirements

### Requirement 1: Automatic S3 Upload of Campaign Images

**User Story:** As a Game Master, I want all campaign images to be automatically uploaded to S3, so that the player-activity and other consumers can access them without manual intervention.

#### Acceptance Criteria

1. WHEN a new CampaignImage is created in the local database, THE Image_Sync_Service SHALL compute the SHA-256 Checksum of the image file and store it in the `hash` field of the ImageRef.
2. WHEN a session starts, THE Image_Sync_Service SHALL request presigned PUT URLs from the Presigned_URL_API for all CampaignImage files that have no corresponding object on S3, and upload the full-resolution variant at `<CampaignId>/<CampaignImageId>.webp`, the thumbnail at `<CampaignId>/<CampaignImageId>_thumb.webp`, and the Token_Portrait (if a Clip_Region is defined) at `<CampaignId>/<CampaignImageId>_token.webp` using HTTP PUT to the presigned URLs.
3. WHEN the session-start sync detects a CampaignImage whose local Checksum differs from the `hash` value recorded at last successful upload, THE Image_Sync_Service SHALL request new presigned PUT URLs from the Presigned_URL_API and re-upload all variants of that image to S3 at their respective paths using HTTP PUT.
4. THE Image_Sync_Service SHALL upload up to three variants for each CampaignImage: the full-resolution image (converted to WebP), a thumbnail (max 256×256 pixels, WebP), and the Token_Portrait (128×128 pixels, WebP, generated only if a Clip_Region is defined on the CampaignImage).
5. THE Image_Sync_Service SHALL store the `thumbnailUrl`, `canonUrl`, and `tokenPortraitUrl` (when a Token_Portrait variant was uploaded) fields in the ImageRef after successful upload of all variants to S3.
6. IF an upload to S3 via presigned URL fails after up to 3 retry attempts with exponential backoff, THEN THE Image_Sync_Service SHALL log the error including the CampaignImageId and failure reason, skip the failed image, and continue processing remaining images.

### Requirement 2: Incremental Sync via Manifest and Timestamp

**User Story:** As a Game Master, I want the sync process to be fast and incremental, so that only new or modified images are uploaded each session.

#### Acceptance Criteria

1. WHEN a session starts, THE Master_App SHALL request the image manifest from the Image_Manifest_API, receiving the list of object keys and their ETags currently on S3 for the active campaign.
2. WHEN the manifest is received, THE Image_Sync_Service SHALL identify images requiring upload by flagging any CampaignImage whose object key is absent from the manifest or whose local Checksum differs from the value recorded at last successful upload for that image.
3. WHEN a sync cycle completes with all queued images either successfully uploaded or individually skipped due to error, THE Image_Sync_Service SHALL record a `lastSyncedAt` UTC timestamp locally.
4. IF the `lastSyncedAt` timestamp is more recent than all CampaignImage `updatedAt` values (including Clip_Region modifications on any CampaignImage), THEN THE Image_Sync_Service SHALL skip the sync cycle entirely without requesting the manifest.
5. THE Image_Manifest_API SHALL respond within 2000 ms (p95) for campaigns with up to 500 images.
6. IF the manifest request fails or does not respond within 10 000 ms, THEN THE Image_Sync_Service SHALL abort the sync cycle, retain the previous `lastSyncedAt` value unchanged, and surface an error indication to the GM.
7. THE Image_Sync_Service SHALL store the S3 ETag returned after each successful upload alongside the CampaignImage record, using this stored ETag for future manifest comparison instead of comparing the local SHA-256 Checksum directly to the S3 ETag.

### Requirement 3: Image Manifest API

**User Story:** As a Game Master, I want a performant API endpoint that lists images on S3, so that the master-app can determine what needs syncing without scanning the bucket directly.

#### Acceptance Criteria

1. THE Image_Manifest_API SHALL accept a `campaignId` path parameter and return a JSON array of objects containing `key` (S3 object key) and `etag` (S3 ETag) for all images under the campaign prefix, handling S3 pagination internally so that all objects are returned regardless of count.
2. THE Image_Manifest_API SHALL be deployed as an API Gateway route backed by a Lambda function.
3. IF the `campaignId` path parameter is missing or is not a valid UUID v7 format, THEN THE Image_Manifest_API SHALL return HTTP 400 with an error message indicating the validation failure.
4. THE Image_Manifest_API SHALL require a valid session master token (role `master`) via Bearer authorization header, using the same HMAC-based verification as existing session-sync endpoints.
5. IF the authorization token is missing, expired, or invalid, THEN THE Image_Manifest_API SHALL return HTTP 401. IF the token is valid but the role is not `master` or the token `campaignId` claim does not match the path parameter, THEN THE Image_Manifest_API SHALL return HTTP 403.
6. IF the S3 ListObjects operation fails, THEN THE Image_Manifest_API SHALL return HTTP 502 with an error message indicating an upstream storage failure.

### Requirement 4: Token Portrait Square Clipping

**User Story:** As a Game Master, I want to define a square crop zone on a Character or NPC image, so that the cropped portrait is used as their token on the tabletop (rendered as circular for now, but stored as square to support future token shapes).

#### Acceptance Criteria

1. THE Token_Clip_Editor SHALL allow the GM to select a square region on any CampaignImage by specifying center coordinates (centerX, centerY) and half-side length (halfSide), all expressed as values in the range 0.0 to 1.0 relative to image dimensions, constrained so that the square fits entirely within the image bounds (centerX − halfSide ≥ 0.0, centerX + halfSide ≤ 1.0, centerY − halfSide ≥ 0.0, centerY + halfSide ≤ 1.0) and the halfSide is at least 0.05.
2. WHEN the GM confirms a Clip_Region, THE Master_App SHALL persist the Clip_Region data (centerX, centerY, halfSide) in the CampaignImage record in the local database.
3. WHEN a CampaignImage has a Clip_Region defined and is the primary image of a Character or NPC, THE Image_Sync_Service SHALL generate a square crop from the Clip_Region, resize it to 128×128 pixels, encode it as WebP, and upload it to S3 at path `<CampaignId>/<CampaignImageId>_token.webp`.
4. THE Player_Activity SHALL render Token_Portrait images as circular clips (CSS border-radius: 50%) on the tabletop board when a `tokenPortraitUrl` is present in the token data.
5. WHILE no Clip_Region is defined on the primary image of a Character or NPC, THE Player_Activity SHALL continue rendering the token using the existing literal-label fallback.
6. THE Token_Clip_Editor SHALL display a live preview of the square crop result, updating within 200ms of any change to center or halfSide, before the GM confirms.
7. IF the Character or NPC has no primary image assigned, THEN THE Token_Clip_Editor SHALL be disabled and display a message indicating that an image must be added before defining a clip region.
8. WHEN the GM removes an existing Clip_Region from a CampaignImage, THE Master_App SHALL delete the Clip_Region data from the CampaignImage record, and THE Image_Sync_Service SHALL delete the corresponding `<CampaignId>/<CampaignImageId>_token.webp` object from S3.
9. WHEN the source file of a CampaignImage with a defined Clip_Region is replaced, THE Image_Sync_Service SHALL re-generate and re-upload the Token_Portrait using the existing Clip_Region values applied to the new image content.

### Requirement 5: Map Background Selection from Existing Images

**User Story:** As a Game Master, I want to choose a map background from images already in the system, so that I do not need to re-upload or re-import images each time.

#### Acceptance Criteria

1. WHEN the GM activates "Change map background", THE Master_App SHALL display a picker showing all CampaignImage entries available for the active campaign.
2. THE Master_App SHALL display each CampaignImage as a thumbnail (max 256×256) with its title in the picker.
3. IF the active campaign has no CampaignImage entries, THEN THE Master_App SHALL display an empty-state message in the picker indicating no images are available for selection.
4. WHEN the GM selects a CampaignImage from the picker, THE Master_App SHALL assign that image as the active map background, set the map `widthPx` and `heightPx` to the selected image's pixel dimensions, and derive `gridRows` from the current `gridCols` and the image aspect ratio.
5. IF the GM selects a CampaignImage whose local file is missing or unreadable, THEN THE Master_App SHALL display an error message indicating the image is unavailable and SHALL NOT change the current map background.
6. THE Master_App SHALL continue to allow uploading a new image as an alternative to selecting an existing one.
7. WHEN the GM uploads a new image via the map background picker, THE Master_App SHALL create a corresponding CampaignImage entry before assigning it as the map background.

### Requirement 6: Tabletop UI Maximization and Header Cleanup

**User Story:** As a Game Master, I want the tabletop play area to be maximized and the header simplified, so that players have the largest possible view of the game board.

#### Acceptance Criteria

1. WHILE the session status is "connected", THE Player_Activity SHALL display only the Amber Coffer icon (maximum 24×24 px) and the current campaign name (truncated with ellipsis at 40 characters) in the header area.
2. WHILE the session status is "connected", THE Player_Activity SHALL hide the application title text (i18n key `app.title`), the subtitle text (i18n key `app.subtitle`), and the player Discord ID from the visible header.
3. WHILE the session status is "connected", THE Player_Activity SHALL render the tabletop viewport using CSS `flex: 1` (or equivalent) so that it fills all remaining vertical space below the header, with the header height not exceeding 48 px.
4. WHILE the session status is "idle", "connecting", "ended", or "error", THE Player_Activity SHALL display the full application header with title and subtitle.
5. THE Player_Activity header SHALL render the campaign name inside an element with an HTML heading role (`h1` through `h6`) during all session states where the header is visible.
6. IF the campaign name is unavailable at render time, THEN THE Player_Activity SHALL display a localized fallback label (i18n key) in place of the campaign name.

### Requirement 7: Token Portrait URL in Sync Payload

**User Story:** As a player, I want to see character portraits on the tabletop tokens, so that I can visually identify characters during gameplay.

#### Acceptance Criteria

1. THE tabletop snapshot SHALL include a `tokenPortraitUrls` field defined as a record keyed by Token ID (string) with values being absolute CloudFront URLs (string), defaulting to an empty record when no tokens have portraits.
2. WHEN a token has a Token_Portrait uploaded to S3, THE Master_App SHALL include its CloudFront URL in the `tokenPortraitUrls` field of the tabletop snapshot.
3. WHILE a token has no Token_Portrait, THE Master_App SHALL omit that token's entry from `tokenPortraitUrls`.
4. IF a token's `tokenPortraitUrls` entry is absent or the image fails to load, THEN THE Player_Activity SHALL render the token using the `tokenLabels` literal-label fallback.
5. WHEN a Token_Portrait is updated (new Clip_Region or modified source image), THE Master_App SHALL include the updated CloudFront URL in the `tokenPortraitUrls` field within the next snapshot push (within one poll cycle of 2000ms after the upload completes).

### Requirement 8: Manual Sync Trigger from Image Gallery

**User Story:** As a Game Master, I want a button in the image gallery that forces a full check of all campaign images and uploads any missing or changed ones, so that I can ensure S3 is up-to-date without waiting for the next session start.

#### Acceptance Criteria

1. THE Master_App SHALL display a Manual_Sync_Button in the image gallery view, visually distinct and labeled with a localized string (i18n key).
2. WHEN the GM presses the Manual_Sync_Button, THE Image_Sync_Service SHALL request the image manifest from the Image_Manifest_API and compare all CampaignImage records against the manifest, identifying images whose object key is absent or whose local Checksum differs from the value recorded at last successful upload.
3. WHEN the manual sync identifies images requiring upload, THE Image_Sync_Service SHALL upload all missing or changed image variants (full-resolution, thumbnail, and Token_Portrait where applicable) following the same logic as the session-start sync defined in Requirement 1.
4. WHILE a manual sync is in progress, THE Master_App SHALL display a progress indicator showing the number of images uploaded out of the total requiring upload.
5. WHILE a manual sync is in progress, THE Master_App SHALL disable the Manual_Sync_Button to prevent concurrent sync operations.
6. WHEN the manual sync completes successfully with all images uploaded, THE Master_App SHALL display a localized success notification indicating the number of images synchronized.
7. IF one or more images fail to upload during the manual sync, THEN THE Master_App SHALL display a localized warning notification listing the count of failed images and continue processing remaining images.
8. IF the manifest request fails during a manual sync, THEN THE Master_App SHALL display a localized error notification indicating the sync could not be performed and re-enable the Manual_Sync_Button.
9. WHEN the manual sync completes (regardless of individual image failures), THE Image_Sync_Service SHALL update the `lastSyncedAt` timestamp following the same rules as the session-start sync defined in Requirement 2.

### Requirement 9: Presigned URL API for S3 Uploads

**User Story:** As a Game Master, I want the master-app to upload images via presigned URLs, so that the application does not require local AWS credentials and can be used by users without an AWS profile.

#### Acceptance Criteria

1. THE Presigned_URL_API SHALL accept a POST request with a JSON body containing a `campaignId` (string, UUID v7) and a `keys` array (list of S3 object key strings), and return a JSON object mapping each requested key to a presigned PUT URL valid for 15 minutes.
2. THE Presigned_URL_API SHALL be deployed as an API Gateway route backed by a Lambda function.
3. THE Presigned_URL_API SHALL require a valid session master token (role `master`) via Bearer authorization header, using the same HMAC-based verification as existing session-sync endpoints.
4. IF the authorization token is missing, expired, or invalid, THEN THE Presigned_URL_API SHALL return HTTP 401. IF the token is valid but the role is not `master` or the token `campaignId` claim does not match the request body `campaignId`, THEN THE Presigned_URL_API SHALL return HTTP 403.
5. IF the `campaignId` is missing or not a valid UUID v7 format, or the `keys` array is empty or contains more than 50 entries, THEN THE Presigned_URL_API SHALL return HTTP 400 with an error message indicating the validation failure.
6. THE Image_Sync_Service SHALL use presigned PUT URLs obtained from the Presigned_URL_API for all S3 uploads, performing a simple HTTP PUT with the image bytes as body and `Content-Type: image/webp` header.
7. IF the Presigned_URL_API request fails or does not respond within 10 000 ms, THEN THE Image_Sync_Service SHALL abort the current upload batch, log the error, and continue with remaining batches or terminate the sync cycle if no batches remain.
