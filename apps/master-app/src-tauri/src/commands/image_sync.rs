use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;

use crate::db::AppState;
use crate::error::AppError;
use crate::models::image_sync::{SyncProgress, SyncReport};
use crate::services::{campaign_storage, image_sync};

/// Tauri command: trigger a full image sync for a campaign.
///
/// Resolves the campaign storage root, creates a progress channel,
/// spawns the sync task forwarding progress events to the frontend,
/// and returns the final SyncReport.
#[tauri::command]
pub async fn sync_campaign_images_cmd(
    campaign_id: String,
    session_token: String,
    sync_api_base_url: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SyncReport, AppError> {
    let pool = state.pool_for_campaign(&app, &campaign_id).await?;
    let campaign_storage_root = campaign_storage::resolve_storage_folder(&app, &campaign_id)?;

    let (progress_tx, mut progress_rx) = mpsc::channel::<SyncProgress>(32);

    // Spawn a task to forward progress events to the frontend via Tauri events
    let app_handle = app.clone();
    tokio::spawn(async move {
        while let Some(progress) = progress_rx.recv().await {
            let _ = app_handle.emit("sync-progress", &progress);
        }
    });

    let report = image_sync::sync_campaign_images(
        &pool,
        &campaign_id,
        &campaign_storage_root,
        &sync_api_base_url,
        &session_token,
        Some(progress_tx),
    )
    .await?;

    Ok(report)
}
