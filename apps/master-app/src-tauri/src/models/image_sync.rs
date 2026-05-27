use serde::{Deserialize, Serialize};

/// A single entry from the Image Manifest API response.
/// Represents an object currently stored on S3 for a campaign.
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct ManifestEntry {
    pub key: String,
    pub etag: String,
}

/// Describes what action the sync service needs to take for a given image.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncAction {
    /// Image needs to be uploaded (new or modified).
    Upload {
        campaign_image_id: String,
        /// The reason this image needs uploading.
        reason: UploadReason,
    },
    /// Image is already up-to-date on S3, no action needed.
    Skip { campaign_image_id: String },
}

/// Why an image needs to be uploaded during sync.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UploadReason {
    /// The S3 object key is absent from the manifest.
    Missing,
    /// The local file hash differs from the stored `last_uploaded_hash`.
    Modified,
}

/// Final report returned after a sync cycle completes.
/// Serialized and sent to the frontend via Tauri command response.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    /// Number of images successfully uploaded.
    pub uploaded: u32,
    /// Number of images skipped (already up-to-date).
    pub skipped: u32,
    /// Number of images that failed to upload after retries.
    pub failed: u32,
}

/// Progress update emitted during sync for UI feedback via Tauri events.
/// Sent through a channel to the frontend as the sync progresses.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgress {
    /// Number of images processed so far.
    pub current: u32,
    /// Total number of images that need processing in this sync cycle.
    pub total: u32,
}
