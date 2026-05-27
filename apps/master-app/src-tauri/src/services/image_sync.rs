use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::Duration;

use reqwest::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use tokio::sync::mpsc;

use crate::error::{AppError, AppResult};
use crate::models::image_sync::{ManifestEntry, SyncAction, SyncProgress, SyncReport, UploadReason};
use crate::models::vault_json::ImageRef;
use crate::models::ClipRegion;
use crate::services::image_processing;

/// Path prefix for campaign images on CloudFront (relative, no domain).
/// The Discord Activity proxy maps "/" to the CloudFront distribution,
/// so paths must be relative for the iframe to resolve them correctly.
const CLOUDFRONT_BASE: &str = "/campaign-images";

/// Maximum number of images per batch. Each image generates 2-3 S3 keys
/// (full + thumb + optional token), and the presigned URL API accepts max 50 keys.
/// 16 images × 3 keys = 48, safely under the limit.
const BATCH_SIZE: usize = 16;

/// Quick check: can we skip sync entirely?
///
/// Returns `true` iff `last_synced_at` is `Some` and strictly greater than
/// `max_updated_at`, meaning no images have been modified since the last sync.
pub fn should_skip_sync(last_synced_at: Option<i64>, max_updated_at: i64) -> bool {
    match last_synced_at {
        Some(ts) => ts > max_updated_at,
        None => false,
    }
}

/// Local image data needed for sync diff comparison.
/// Represents the subset of CampaignImage fields relevant to determining
/// whether an upload is required.
#[derive(Debug, Clone)]
pub struct CampaignImageSyncRow {
    pub campaign_image_id: String,
    /// The S3 object key this image should have.
    pub expected_key: String,
    /// Hash recorded at last successful upload (None if never uploaded).
    pub last_uploaded_hash: Option<String>,
    /// Current SHA-256 hash of the local file.
    pub current_hash: String,
}

/// Compare local state against manifest, return images needing upload.
///
/// An image needs upload when:
/// 1. Its expected S3 object key is absent from the manifest, OR
/// 2. Its current local hash differs from `last_uploaded_hash` (file was modified locally)
///
/// Otherwise the image is skipped (already up-to-date).
pub fn compute_sync_diff(
    images: &[CampaignImageSyncRow],
    manifest: &[ManifestEntry],
) -> Vec<SyncAction> {
    let manifest_keys: HashSet<&str> = manifest.iter().map(|e| e.key.as_str()).collect();

    images
        .iter()
        .map(|img| {
            if !manifest_keys.contains(img.expected_key.as_str()) {
                SyncAction::Upload {
                    campaign_image_id: img.campaign_image_id.clone(),
                    reason: UploadReason::Missing,
                }
            } else if img.last_uploaded_hash.as_deref() != Some(img.current_hash.as_str()) {
                SyncAction::Upload {
                    campaign_image_id: img.campaign_image_id.clone(),
                    reason: UploadReason::Modified,
                }
            } else {
                SyncAction::Skip {
                    campaign_image_id: img.campaign_image_id.clone(),
                }
            }
        })
        .collect()
}

/// Maximum number of upload attempts before giving up.
const MAX_RETRIES: u32 = 3;

/// Base delay in milliseconds for exponential backoff between retries.
const BASE_DELAY_MS: u64 = 1000;

/// Upload image bytes to S3 via presigned PUT URL.
///
/// Retries up to 3 times with exponential backoff (1s, 2s, 4s) on failure.
/// Logs a warning on each retry attempt and on final failure.
pub async fn upload_via_presigned_url(
    http_client: &reqwest::Client,
    presigned_url: &str,
    image_bytes: &[u8],
) -> AppResult<()> {
    for attempt in 0..MAX_RETRIES {
        match try_upload(http_client, presigned_url, image_bytes).await {
            Ok(()) => return Ok(()),
            Err(e) if attempt < MAX_RETRIES - 1 => {
                let delay = BASE_DELAY_MS * 2u64.pow(attempt);
                tracing::warn!(
                    attempt = attempt + 1,
                    delay_ms = delay,
                    error = %e,
                    "S3 upload retry"
                );
                tokio::time::sleep(Duration::from_millis(delay)).await;
            }
            Err(e) => {
                tracing::warn!(
                    attempt = attempt + 1,
                    error = %e,
                    "S3 upload failed after all retries"
                );
                return Err(e);
            }
        }
    }
    unreachable!()
}

/// Single upload attempt: HTTP PUT with image bytes and Content-Type: image/webp.
async fn try_upload(
    http_client: &reqwest::Client,
    presigned_url: &str,
    image_bytes: &[u8],
) -> AppResult<()> {
    let response = http_client
        .put(presigned_url)
        .header(CONTENT_TYPE, "image/webp")
        .body(image_bytes.to_vec())
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("S3 upload request failed: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!(
            "S3 upload failed with status {status}: {text}"
        )));
    }

    Ok(())
}

/// Response envelope from the Image Manifest API.
#[derive(Debug, Deserialize)]
struct ManifestResponse {
    images: Vec<ManifestEntry>,
}

/// Fetch the image manifest from the API for a given campaign.
/// Performs a GET request to `/campaign/{campaign_id}/images/manifest`
/// with Bearer token authentication and a 10-second timeout.
pub async fn fetch_manifest(
    sync_api_base_url: &str,
    session_token: &str,
    campaign_id: &str,
) -> AppResult<Vec<ManifestEntry>> {
    let base = sync_api_base_url.trim_end_matches('/');
    let url = format!("{base}/campaign/{campaign_id}/images/manifest");

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| AppError::Internal(format!("http_client_build_failed: {e}")))?;

    let response = client
        .get(&url)
        .header("authorization", format!("Bearer {session_token}"))
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                AppError::Internal("manifest_timeout: request exceeded 10s".into())
            } else {
                AppError::Internal(format!("manifest_request_failed: {e}"))
            }
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!(
            "manifest_http_error:{status}:{text}"
        )));
    }

    let manifest: ManifestResponse = response.json().await.map_err(|e| {
        AppError::Internal(format!("manifest_parse_failed: {e}"))
    })?;

    Ok(manifest.images)
}

/// Response wrapper for the Presigned URL API.
/// The API returns `{ "urls": { "key1": "url1", "key2": "url2", ... } }`.
#[derive(Debug, Deserialize)]
struct PresignedUrlsResponse {
    urls: HashMap<String, String>,
}

/// Request body for the Presigned URL API.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PresignedUrlsRequestBody<'a> {
    campaign_id: &'a str,
    keys: &'a [String],
}

/// Request presigned PUT URLs for a batch of S3 keys (max 50).
///
/// POSTs to `{sync_api_base_url}/campaign/{campaign_id}/images/presigned-urls`
/// with Bearer authorization and a 10-second timeout.
/// Returns a mapping of S3 object key → presigned PUT URL.
pub async fn request_presigned_urls(
    sync_api_base_url: &str,
    session_token: &str,
    campaign_id: &str,
    keys: &[String],
) -> AppResult<HashMap<String, String>> {
    let base = sync_api_base_url.trim_end_matches('/');
    let url = format!("{base}/campaign/{campaign_id}/images/presigned-urls");

    let body = PresignedUrlsRequestBody { campaign_id, keys };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| AppError::Internal(format!("http_client_build_failed: {e}")))?;

    let response = client
        .post(&url)
        .header("authorization", format!("Bearer {session_token}"))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                AppError::Internal(
                    "presigned_urls_timeout: request exceeded 10s".to_string(),
                )
            } else {
                AppError::Internal(format!("presigned_urls_request_failed: {e}"))
            }
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!(
            "presigned_urls_http_error:{status}:{text}"
        )));
    }

    let parsed: PresignedUrlsResponse = response
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("presigned_urls_parse_failed: {e}")))?;

    Ok(parsed.urls)
}

/// Row fetched from DB for each campaign image during sync.
/// Includes the local file path and optional clip region for variant generation.
#[derive(Debug, Clone)]
struct CampaignImageFullRow {
    pub id: String,
    pub image_ref_json: Option<String>,
    pub clip_region_json: Option<String>,
    pub last_uploaded_hash: Option<String>,
}

/// Entry point for session-start sync and manual sync.
///
/// Orchestrates the full sync pipeline:
/// 1. Check if sync can be skipped (timestamp comparison)
/// 2. Fetch manifest from API
/// 3. Load local campaign images and compute diff
/// 4. Batch presigned URL requests (max 50 keys per batch)
/// 5. Process image variants and upload
/// 6. Update DB with sync results
/// 7. Update lastSyncedAt timestamp
pub async fn sync_campaign_images(
    pool: &SqlitePool,
    campaign_id: &str,
    campaign_storage_root: &Path,
    sync_api_base_url: &str,
    session_token: &str,
    progress_tx: Option<mpsc::Sender<SyncProgress>>,
) -> AppResult<SyncReport> {
    tracing::info!(campaign_id, "starting image sync");

    // Step 1: Check if we can skip sync
    let max_updated_at: Option<i64> = sqlx::query_scalar(
        "SELECT MAX(updated_at) FROM campaign_images WHERE campaign_id = ?",
    )
    .bind(campaign_id)
    .fetch_one(pool)
    .await?;

    let last_synced_at: Option<i64> = sqlx::query_scalar(
        "SELECT last_synced_at FROM image_sync_state WHERE campaign_id = ?",
    )
    .bind(campaign_id)
    .fetch_optional(pool)
    .await?
    .flatten();

    tracing::info!(
        ?last_synced_at,
        ?max_updated_at,
        "sync timestamp check"
    );

    // If no images exist, nothing to sync
    let max_updated_at = match max_updated_at {
        Some(ts) => ts,
        None => {
            tracing::info!("no campaign images found, nothing to sync");
            return Ok(SyncReport {
                uploaded: 0,
                skipped: 0,
                failed: 0,
            });
        }
    };

    if should_skip_sync(last_synced_at, max_updated_at) {
        // Safety check: if lastSyncedAt is set but no images have a last_uploaded_hash,
        // the timestamp was set erroneously (e.g. a failed sync). Reset it and proceed.
        let has_any_uploaded: bool = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM campaign_images WHERE campaign_id = ? AND last_uploaded_hash IS NOT NULL",
        )
        .bind(campaign_id)
        .fetch_one(pool)
        .await? > 0;

        if !has_any_uploaded {
            tracing::warn!("lastSyncedAt is set but no images were ever uploaded — resetting and proceeding with full sync");
            sqlx::query("DELETE FROM image_sync_state WHERE campaign_id = ?")
                .bind(campaign_id)
                .execute(pool)
                .await?;
        } else {
            // Count total images for the skipped report
            let total: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM campaign_images WHERE campaign_id = ? AND image_ref_json IS NOT NULL",
            )
            .bind(campaign_id)
            .fetch_one(pool)
            .await?;

            tracing::info!(
                total,
                "skipping sync: lastSyncedAt is more recent than all image updates"
            );
            return Ok(SyncReport {
                uploaded: 0,
                skipped: total as u32,
                failed: 0,
            });
        }
    }

    // Step 2: Fetch manifest from API
    tracing::info!("fetching manifest from API...");
    let manifest = fetch_manifest(sync_api_base_url, session_token, campaign_id).await?;
    tracing::info!(manifest_entries = manifest.len(), "manifest received");

    // Step 3: Load all campaign images with sync-relevant fields
    let rows = sqlx::query_as::<_, (String, Option<String>, Option<String>, Option<String>)>(
        r#"
        SELECT id, image_ref_json, clip_region_json, last_uploaded_hash
        FROM campaign_images
        WHERE campaign_id = ? AND image_ref_json IS NOT NULL
        "#,
    )
    .bind(campaign_id)
    .fetch_all(pool)
    .await?;

    tracing::info!(local_images = rows.len(), "loaded campaign images from DB");

    let full_rows: Vec<CampaignImageFullRow> = rows
        .into_iter()
        .map(|(id, image_ref_json, clip_region_json, last_uploaded_hash)| {
            CampaignImageFullRow {
                id,
                image_ref_json,
                clip_region_json,
                last_uploaded_hash,
            }
        })
        .collect();

    // Build sync rows for diff computation
    let sync_rows: Vec<CampaignImageSyncRow> = full_rows
        .iter()
        .filter_map(|row| {
            let image_ref: ImageRef = serde_json::from_str(row.image_ref_json.as_deref()?).ok()?;
            let hash = image_ref.hash.clone()?;
            let expected_key = format!("campaign-images/{}/{}.webp", campaign_id, row.id);
            Some(CampaignImageSyncRow {
                campaign_image_id: row.id.clone(),
                expected_key,
                last_uploaded_hash: row.last_uploaded_hash.clone(),
                current_hash: hash,
            })
        })
        .collect();

    tracing::info!(
        sync_rows = sync_rows.len(),
        full_rows = full_rows.len(),
        "sync rows built (images with valid hash)"
    );

    // Step 4: Compute diff
    let actions = compute_sync_diff(&sync_rows, &manifest);

    let images_to_upload: Vec<&str> = actions
        .iter()
        .filter_map(|a| match a {
            SyncAction::Upload { campaign_image_id, .. } => Some(campaign_image_id.as_str()),
            SyncAction::Skip { .. } => None,
        })
        .collect();

    let skipped_count = actions.len() as u32 - images_to_upload.len() as u32;

    tracing::info!(
        to_upload = images_to_upload.len(),
        to_skip = skipped_count,
        "sync diff computed"
    );

    if images_to_upload.is_empty() {
        update_sync_state(pool, campaign_id, "success").await?;
        return Ok(SyncReport {
            uploaded: 0,
            skipped: skipped_count,
            failed: 0,
        });
    }

    // Build a lookup map for full rows by id
    let full_row_map: HashMap<&str, &CampaignImageFullRow> =
        full_rows.iter().map(|r| (r.id.as_str(), r)).collect();

    let http_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::Internal(format!("http_client_build_failed: {e}")))?;

    let total_to_upload = images_to_upload.len() as u32;
    let mut uploaded = 0u32;
    let mut failed = 0u32;
    let mut processed = 0u32;

    // Step 5-6: Process in batches of BATCH_SIZE
    for batch in images_to_upload.chunks(BATCH_SIZE) {
        // Collect all S3 keys needed for this batch (full + thumb + token)
        let mut all_keys: Vec<String> = Vec::new();
        for &img_id in batch {
            all_keys.push(format!("campaign-images/{}/{}.webp", campaign_id, img_id));
            all_keys.push(format!("campaign-images/{}/{}_thumb.webp", campaign_id, img_id));
            // Check if clip region exists for token variant
            if let Some(row) = full_row_map.get(img_id) {
                if row.clip_region_json.is_some() {
                    all_keys.push(format!(
                        "campaign-images/{}/{}_token.webp",
                        campaign_id, img_id
                    ));
                }
            }
        }

        // Request presigned URLs for the batch
        let presigned_urls = match request_presigned_urls(
            sync_api_base_url,
            session_token,
            campaign_id,
            &all_keys,
        )
        .await
        {
            Ok(urls) => urls,
            Err(e) => {
                tracing::error!(error = %e, "presigned URL batch request failed, aborting batch");
                failed += batch.len() as u32;
                processed += batch.len() as u32;
                send_progress(&progress_tx, processed, total_to_upload).await;
                continue;
            }
        };

        // Process each image in the batch
        for &img_id in batch {
            let result = process_and_upload_image(
                &http_client,
                pool,
                campaign_id,
                img_id,
                campaign_storage_root,
                &full_row_map,
                &presigned_urls,
            )
            .await;

            match result {
                Ok(()) => uploaded += 1,
                Err(e) => {
                    tracing::warn!(
                        campaign_image_id = img_id,
                        error = %e,
                        "image sync failed, skipping"
                    );
                    failed += 1;
                }
            }

            processed += 1;
            send_progress(&progress_tx, processed, total_to_upload).await;
        }
    }

    // Step 7: Update lastSyncedAt only if at least one upload succeeded.
    // Never update the timestamp if ALL images failed — this ensures a retry
    // will re-attempt the full sync next time.
    if uploaded > 0 {
        let status = if failed == 0 { "success" } else { "partial" };
        update_sync_state(pool, campaign_id, status).await?;
        tracing::info!(uploaded, failed, skipped = skipped_count, status, "sync state updated");
    } else {
        tracing::warn!(failed, "no images uploaded successfully, NOT updating lastSyncedAt");
    }

    Ok(SyncReport {
        uploaded,
        skipped: skipped_count,
        failed,
    })
}

/// Process all variants for a single image and upload them.
/// On success, updates the DB with s3_etag, last_uploaded_hash, and ImageRef URLs.
async fn process_and_upload_image(
    http_client: &reqwest::Client,
    pool: &SqlitePool,
    campaign_id: &str,
    image_id: &str,
    campaign_storage_root: &Path,
    full_row_map: &HashMap<&str, &CampaignImageFullRow>,
    presigned_urls: &HashMap<String, String>,
) -> AppResult<()> {
    let row = full_row_map
        .get(image_id)
        .ok_or_else(|| AppError::Internal(format!("image row not found: {image_id}")))?;

    let image_ref: ImageRef = serde_json::from_str(
        row.image_ref_json
            .as_deref()
            .ok_or_else(|| AppError::Internal("missing image_ref_json".into()))?,
    )?;

    let local_path = image_ref
        .local
        .as_deref()
        .ok_or_else(|| AppError::Internal(format!("no local path for image {image_id}")))?;

    let source_path = campaign_storage_root.join(local_path);
    if !source_path.is_file() {
        return Err(AppError::Internal(format!(
            "local file missing: {}",
            source_path.display()
        )));
    }

    tracing::info!(
        campaign_image_id = image_id,
        local_path = %source_path.display(),
        "processing image variants for S3 upload"
    );

    // Generate full-resolution WebP
    let full_key = format!("campaign-images/{}/{}.webp", campaign_id, image_id);
    let (full_bytes, _, _) = image_processing::convert_to_webp(&source_path, image_processing::MAX_FULL_EDGE_PX)?;

    let full_url = presigned_urls
        .get(&full_key)
        .ok_or_else(|| AppError::Internal(format!("no presigned URL for key: {full_key}")))?;
    tracing::info!(key = %full_key, size_bytes = full_bytes.len(), "uploading full-resolution image to S3");
    upload_via_presigned_url(http_client, full_url, &full_bytes).await?;
    tracing::info!(key = %full_key, "upload complete");

    // Generate thumbnail
    let thumb_key = format!("campaign-images/{}/{}_thumb.webp", campaign_id, image_id);
    let thumb_bytes = image_processing::generate_thumbnail(&source_path)?;

    let thumb_url = presigned_urls
        .get(&thumb_key)
        .ok_or_else(|| AppError::Internal(format!("no presigned URL for key: {thumb_key}")))?;
    tracing::info!(key = %thumb_key, size_bytes = thumb_bytes.len(), "uploading thumbnail to S3");
    upload_via_presigned_url(http_client, thumb_url, &thumb_bytes).await?;
    tracing::info!(key = %thumb_key, "upload complete");

    // Generate token portrait if clip region exists
    let clip_region: Option<ClipRegion> = row
        .clip_region_json
        .as_deref()
        .and_then(|json| serde_json::from_str(json).ok());

    let token_portrait_url = if let Some(ref clip) = clip_region {
        let token_key = format!("campaign-images/{}/{}_token.webp", campaign_id, image_id);
        let token_bytes = image_processing::generate_token_portrait(&source_path, clip)?;

        let token_presigned = presigned_urls
            .get(&token_key)
            .ok_or_else(|| AppError::Internal(format!("no presigned URL for key: {token_key}")))?;
        tracing::info!(key = %token_key, size_bytes = token_bytes.len(), "uploading token portrait to S3");
        upload_via_presigned_url(http_client, token_presigned, &token_bytes).await?;
        tracing::info!(key = %token_key, "upload complete");

        Some(format!("{CLOUDFRONT_BASE}/{campaign_id}/{image_id}_token.webp"))
    } else {
        None
    };

    // Compute hash of the source file for tracking
    let file_bytes = std::fs::read(&source_path)
        .map_err(|e| AppError::Internal(format!("failed to read file for hash: {e}")))?;
    let hash = format!("{:x}", Sha256::digest(&file_bytes));

    // Build updated ImageRef with CloudFront URLs
    let updated_ref = ImageRef {
        local: image_ref.local,
        hash: Some(hash.clone()),
        thumbnail_url: Some(format!(
            "{CLOUDFRONT_BASE}/{campaign_id}/{image_id}_thumb.webp"
        )),
        canon_url: Some(format!("{CLOUDFRONT_BASE}/{campaign_id}/{image_id}.webp")),
        token_portrait_url,
    };
    let updated_ref_json = serde_json::to_string(&updated_ref)?;

    // Update DB: image_ref_json, last_uploaded_hash, s3_etag
    // s3_etag is not returned by presigned PUT, so we store the hash as a proxy
    sqlx::query(
        r#"
        UPDATE campaign_images
        SET image_ref_json = ?, last_uploaded_hash = ?, s3_etag = ?
        WHERE id = ?
        "#,
    )
    .bind(&updated_ref_json)
    .bind(&hash)
    .bind(&hash) // s3_etag stored as local hash until manifest provides the real one
    .bind(image_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// Update or insert the sync state for a campaign.
async fn update_sync_state(pool: &SqlitePool, campaign_id: &str, status: &str) -> AppResult<()> {
    let now = crate::util::now_ms();
    sqlx::query(
        r#"
        INSERT INTO image_sync_state (campaign_id, last_synced_at, last_sync_status)
        VALUES (?, ?, ?)
        ON CONFLICT(campaign_id) DO UPDATE SET last_synced_at = excluded.last_synced_at, last_sync_status = excluded.last_sync_status
        "#,
    )
    .bind(campaign_id)
    .bind(now)
    .bind(status)
    .execute(pool)
    .await?;

    Ok(())
}

/// Send progress update via the optional channel.
async fn send_progress(tx: &Option<mpsc::Sender<SyncProgress>>, current: u32, total: u32) {
    if let Some(ref sender) = tx {
        let _ = sender.send(SyncProgress { current, total }).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::image_sync::ManifestEntry;

    // --- should_skip_sync tests ---

    #[test]
    fn skip_sync_when_last_synced_after_all_updates() {
        assert!(should_skip_sync(Some(1000), 999));
    }

    #[test]
    fn no_skip_when_last_synced_equals_max_updated() {
        assert!(!should_skip_sync(Some(1000), 1000));
    }

    #[test]
    fn no_skip_when_last_synced_before_max_updated() {
        assert!(!should_skip_sync(Some(999), 1000));
    }

    #[test]
    fn no_skip_when_never_synced() {
        assert!(!should_skip_sync(None, 1000));
    }
    use proptest::prelude::*;
    use sha2::{Digest, Sha256};

    #[tokio::test]
    async fn upload_success_on_first_attempt() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("PUT", "/test-upload")
            .match_header("content-type", "image/webp")
            .with_status(200)
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let url = format!("{}/test-upload", server.url());
        let bytes = b"fake-webp-data";

        let result = upload_via_presigned_url(&client, &url, bytes).await;
        assert!(result.is_ok());
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn upload_fails_after_all_retries() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("PUT", "/test-upload")
            .match_header("content-type", "image/webp")
            .with_status(500)
            .with_body("Internal Server Error")
            .expect(3)
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let url = format!("{}/test-upload", server.url());
        let bytes = b"fake-webp-data";

        let result = upload_via_presigned_url(&client, &url, bytes).await;
        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("500"));
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn upload_succeeds_on_retry() {
        let mut server = mockito::Server::new_async().await;

        // First attempt fails, second succeeds
        let fail_mock = server
            .mock("PUT", "/test-upload")
            .match_header("content-type", "image/webp")
            .with_status(503)
            .with_body("Service Unavailable")
            .expect(1)
            .create_async()
            .await;

        let success_mock = server
            .mock("PUT", "/test-upload")
            .match_header("content-type", "image/webp")
            .with_status(200)
            .expect(1)
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let url = format!("{}/test-upload", server.url());
        let bytes = b"fake-webp-data";

        let result = upload_via_presigned_url(&client, &url, bytes).await;
        assert!(result.is_ok());
        fail_mock.assert_async().await;
        success_mock.assert_async().await;
    }

    #[tokio::test]
    async fn fetch_manifest_success() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/campaign/test-campaign-id/images/manifest")
            .match_header("authorization", "Bearer test-token")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"images":[{"key":"campaign-images/abc/img1.webp","etag":"\"etag1\""},{"key":"campaign-images/abc/img2.webp","etag":"\"etag2\""}]}"#)
            .create_async()
            .await;

        let result = fetch_manifest(&server.url(), "test-token", "test-campaign-id").await;
        assert!(result.is_ok());
        let entries = result.unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].key, "campaign-images/abc/img1.webp");
        assert_eq!(entries[0].etag, "\"etag1\"");
        assert_eq!(entries[1].key, "campaign-images/abc/img2.webp");
        assert_eq!(entries[1].etag, "\"etag2\"");
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn fetch_manifest_empty_response() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/campaign/camp-1/images/manifest")
            .match_header("authorization", "Bearer tok")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"images":[]}"#)
            .create_async()
            .await;

        let result = fetch_manifest(&server.url(), "tok", "camp-1").await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn fetch_manifest_http_error() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/campaign/camp-1/images/manifest")
            .with_status(403)
            .with_body(r#"{"error":"forbidden"}"#)
            .create_async()
            .await;

        let result = fetch_manifest(&server.url(), "bad-token", "camp-1").await;
        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("manifest_http_error"));
        assert!(err_msg.contains("403"));
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn fetch_manifest_invalid_json() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/campaign/camp-1/images/manifest")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body("not valid json")
            .create_async()
            .await;

        let result = fetch_manifest(&server.url(), "tok", "camp-1").await;
        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("manifest_parse_failed"));
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn request_presigned_urls_success() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("POST", "/campaign/camp-123/images/presigned-urls")
            .match_header("authorization", "Bearer my-token")
            .match_header("content-type", "application/json")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"urls":{"campaign-images/camp-123/img1.webp":"https://s3.example.com/presigned1","campaign-images/camp-123/img2.webp":"https://s3.example.com/presigned2"}}"#)
            .create_async()
            .await;

        let keys = vec![
            "campaign-images/camp-123/img1.webp".to_string(),
            "campaign-images/camp-123/img2.webp".to_string(),
        ];

        let result =
            request_presigned_urls(&server.url(), "my-token", "camp-123", &keys).await;
        assert!(result.is_ok());
        let urls = result.unwrap();
        assert_eq!(urls.len(), 2);
        assert_eq!(
            urls["campaign-images/camp-123/img1.webp"],
            "https://s3.example.com/presigned1"
        );
        assert_eq!(
            urls["campaign-images/camp-123/img2.webp"],
            "https://s3.example.com/presigned2"
        );
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn request_presigned_urls_http_error() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("POST", "/campaign/camp-1/images/presigned-urls")
            .with_status(400)
            .with_body(r#"{"error":"too_many_keys"}"#)
            .create_async()
            .await;

        let keys = vec!["key1.webp".to_string()];
        let result =
            request_presigned_urls(&server.url(), "tok", "camp-1", &keys).await;
        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("presigned_urls_http_error"));
        assert!(err_msg.contains("400"));
        mock.assert_async().await;
    }

    #[tokio::test]
    async fn request_presigned_urls_invalid_json() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("POST", "/campaign/camp-1/images/presigned-urls")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body("not json")
            .create_async()
            .await;

        let keys = vec!["key1.webp".to_string()];
        let result =
            request_presigned_urls(&server.url(), "tok", "camp-1", &keys).await;
        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("presigned_urls_parse_failed"));
        mock.assert_async().await;
    }

    // --- compute_sync_diff tests ---

    #[test]
    fn diff_flags_missing_when_key_absent_from_manifest() {
        let images = vec![CampaignImageSyncRow {
            campaign_image_id: "img-1".to_string(),
            expected_key: "campaign-images/c1/img-1.webp".to_string(),
            last_uploaded_hash: Some("abc123".to_string()),
            current_hash: "abc123".to_string(),
        }];
        let manifest: Vec<ManifestEntry> = vec![];

        let result = compute_sync_diff(&images, &manifest);
        assert_eq!(result.len(), 1);
        assert_eq!(
            result[0],
            SyncAction::Upload {
                campaign_image_id: "img-1".to_string(),
                reason: UploadReason::Missing,
            }
        );
    }

    #[test]
    fn diff_flags_modified_when_hash_differs() {
        let images = vec![CampaignImageSyncRow {
            campaign_image_id: "img-2".to_string(),
            expected_key: "campaign-images/c1/img-2.webp".to_string(),
            last_uploaded_hash: Some("old_hash".to_string()),
            current_hash: "new_hash".to_string(),
        }];
        let manifest = vec![ManifestEntry {
            key: "campaign-images/c1/img-2.webp".to_string(),
            etag: "\"etag-value\"".to_string(),
        }];

        let result = compute_sync_diff(&images, &manifest);
        assert_eq!(result.len(), 1);
        assert_eq!(
            result[0],
            SyncAction::Upload {
                campaign_image_id: "img-2".to_string(),
                reason: UploadReason::Modified,
            }
        );
    }

    #[test]
    fn diff_flags_modified_when_never_uploaded() {
        let images = vec![CampaignImageSyncRow {
            campaign_image_id: "img-3".to_string(),
            expected_key: "campaign-images/c1/img-3.webp".to_string(),
            last_uploaded_hash: None,
            current_hash: "some_hash".to_string(),
        }];
        let manifest = vec![ManifestEntry {
            key: "campaign-images/c1/img-3.webp".to_string(),
            etag: "\"etag\"".to_string(),
        }];

        let result = compute_sync_diff(&images, &manifest);
        assert_eq!(result.len(), 1);
        assert_eq!(
            result[0],
            SyncAction::Upload {
                campaign_image_id: "img-3".to_string(),
                reason: UploadReason::Modified,
            }
        );
    }

    #[test]
    fn diff_skips_when_key_present_and_hash_matches() {
        let images = vec![CampaignImageSyncRow {
            campaign_image_id: "img-4".to_string(),
            expected_key: "campaign-images/c1/img-4.webp".to_string(),
            last_uploaded_hash: Some("matching_hash".to_string()),
            current_hash: "matching_hash".to_string(),
        }];
        let manifest = vec![ManifestEntry {
            key: "campaign-images/c1/img-4.webp".to_string(),
            etag: "\"etag\"".to_string(),
        }];

        let result = compute_sync_diff(&images, &manifest);
        assert_eq!(result.len(), 1);
        assert_eq!(
            result[0],
            SyncAction::Skip {
                campaign_image_id: "img-4".to_string(),
            }
        );
    }

    #[test]
    fn diff_handles_mixed_images() {
        let images = vec![
            CampaignImageSyncRow {
                campaign_image_id: "missing".to_string(),
                expected_key: "campaign-images/c1/missing.webp".to_string(),
                last_uploaded_hash: Some("h1".to_string()),
                current_hash: "h1".to_string(),
            },
            CampaignImageSyncRow {
                campaign_image_id: "modified".to_string(),
                expected_key: "campaign-images/c1/modified.webp".to_string(),
                last_uploaded_hash: Some("old".to_string()),
                current_hash: "new".to_string(),
            },
            CampaignImageSyncRow {
                campaign_image_id: "uptodate".to_string(),
                expected_key: "campaign-images/c1/uptodate.webp".to_string(),
                last_uploaded_hash: Some("same".to_string()),
                current_hash: "same".to_string(),
            },
        ];
        let manifest = vec![
            ManifestEntry {
                key: "campaign-images/c1/modified.webp".to_string(),
                etag: "\"e1\"".to_string(),
            },
            ManifestEntry {
                key: "campaign-images/c1/uptodate.webp".to_string(),
                etag: "\"e2\"".to_string(),
            },
        ];

        let result = compute_sync_diff(&images, &manifest);
        assert_eq!(result.len(), 3);
        assert_eq!(
            result[0],
            SyncAction::Upload {
                campaign_image_id: "missing".to_string(),
                reason: UploadReason::Missing,
            }
        );
        assert_eq!(
            result[1],
            SyncAction::Upload {
                campaign_image_id: "modified".to_string(),
                reason: UploadReason::Modified,
            }
        );
        assert_eq!(
            result[2],
            SyncAction::Skip {
                campaign_image_id: "uptodate".to_string(),
            }
        );
    }

    #[test]
    fn diff_empty_images_returns_empty() {
        let images: Vec<CampaignImageSyncRow> = vec![];
        let manifest = vec![ManifestEntry {
            key: "some-key".to_string(),
            etag: "\"e\"".to_string(),
        }];

        let result = compute_sync_diff(&images, &manifest);
        assert!(result.is_empty());
    }

    // --- Property-based tests ---

    // **Validates: Requirements 1.1**
    proptest! {
        #[test]
        fn sha256_hash_idempotence(data in proptest::collection::vec(any::<u8>(), 0..1024)) {
            let hash1 = {
                let mut hasher = Sha256::new();
                hasher.update(&data);
                format!("{:x}", hasher.finalize())
            };
            let hash2 = {
                let mut hasher = Sha256::new();
                hasher.update(&data);
                format!("{:x}", hasher.finalize())
            };

            prop_assert_eq!(hash1.len(), 64);
            prop_assert_eq!(&hash1, &hash2);
            // Verify all chars are lowercase hex
            prop_assert!(hash1.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        }
    }

    /// Strategy to generate a random CampaignImageSyncRow with a given key.
    fn arb_sync_row() -> impl Strategy<Value = CampaignImageSyncRow> {
        (
            "[a-z0-9]{8}",                          // campaign_image_id
            "[a-z0-9/_.]{10,40}",                   // expected_key
            proptest::option::of("[a-f0-9]{64}"),    // last_uploaded_hash
            "[a-f0-9]{64}",                         // current_hash
        )
            .prop_map(|(id, key, last_hash, cur_hash)| CampaignImageSyncRow {
                campaign_image_id: id,
                expected_key: key,
                last_uploaded_hash: last_hash,
                current_hash: cur_hash,
            })
    }

    fn arb_manifest_entry() -> impl Strategy<Value = ManifestEntry> {
        (
            "[a-z0-9/_.]{10,40}",   // key
            "[a-f0-9]{32}",         // etag
        )
            .prop_map(|(key, etag)| ManifestEntry { key, etag })
    }

    // **Validates: Requirements 1.3, 2.2**
    proptest! {
        #[test]
        fn sync_diff_correctness(
            images in proptest::collection::vec(arb_sync_row(), 0..20),
            manifest in proptest::collection::vec(arb_manifest_entry(), 0..20),
        ) {
            let manifest_keys: HashSet<&str> = manifest.iter().map(|e| e.key.as_str()).collect();
            let result = compute_sync_diff(&images, &manifest);

            prop_assert_eq!(result.len(), images.len());

            for (img, action) in images.iter().zip(result.iter()) {
                let key_present = manifest_keys.contains(img.expected_key.as_str());
                let hash_matches = img.last_uploaded_hash.as_deref() == Some(img.current_hash.as_str());

                match action {
                    SyncAction::Upload { campaign_image_id, reason } => {
                        prop_assert_eq!(campaign_image_id, &img.campaign_image_id);
                        if !key_present {
                            prop_assert_eq!(reason, &UploadReason::Missing);
                        } else {
                            // Key is present but hash doesn't match
                            prop_assert!(!hash_matches);
                            prop_assert_eq!(reason, &UploadReason::Modified);
                        }
                    }
                    SyncAction::Skip { campaign_image_id } => {
                        prop_assert_eq!(campaign_image_id, &img.campaign_image_id);
                        prop_assert!(key_present);
                        prop_assert!(hash_matches);
                    }
                }
            }
        }
    }

    // **Validates: Requirements 2.4**
    proptest! {
        #[test]
        fn skip_sync_predicate(
            last_synced_at in proptest::option::of(any::<i64>()),
            updated_at_values in proptest::collection::vec(any::<i64>(), 1..20),
        ) {
            let max_updated_at = *updated_at_values.iter().max().unwrap();
            let result = should_skip_sync(last_synced_at, max_updated_at);

            let expected = match last_synced_at {
                Some(ts) => ts > max_updated_at,
                None => false,
            };

            prop_assert_eq!(result, expected);
        }
    }
}
