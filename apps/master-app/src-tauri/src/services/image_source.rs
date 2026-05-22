use std::fs;
use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::vault_json::ImageRef;
use crate::services::campaign_storage;
use crate::services::import_images::entity_image_dir;

fn resolve_local_campaign_file(
    app: &AppHandle,
    campaign_id: &str,
    local_path: &str,
) -> AppResult<PathBuf> {
    if local_path.contains("..") || local_path.starts_with('/') {
        return Err(crate::validation_issue::generic_invalid(&["local"]));
    }
    let campaign_root = campaign_storage::resolve_storage_folder(app, campaign_id)?;
    let absolute = campaign_root.join(local_path);
    if !absolute.starts_with(&campaign_root) {
        return Err(crate::validation_issue::generic_invalid(&["local"]));
    }
    if !absolute.is_file() {
        return Err(AppError::NotFound("image_file".into()));
    }
    Ok(absolute)
}

async fn resolve_campaign_image_file(
    app: &AppHandle,
    state: &AppState,
    campaign_id: &str,
    image_id: &str,
) -> AppResult<PathBuf> {
    let pool = state.pool_for_campaign(app, campaign_id).await?;
    let row: Option<(String, Option<String>)> = sqlx::query_as(
        "SELECT campaign_id, image_ref_json FROM campaign_images WHERE id = ?",
    )
    .bind(image_id)
    .fetch_optional(&pool)
    .await?;

    let (row_campaign, image_ref_json) =
        row.ok_or_else(|| AppError::NotFound("campaign_image".into()))?;
    if row_campaign != campaign_id {
        return Err(AppError::NotFound("campaign_image".into()));
    }

    let image_ref: ImageRef = image_ref_json
        .map(|json| serde_json::from_str(&json))
        .transpose()?
        .ok_or_else(|| AppError::Internal("campaign_image_missing_file".into()))?;

    let local = image_ref
        .local
        .ok_or_else(|| AppError::Internal("campaign_image_missing_file".into()))?;
    resolve_local_campaign_file(app, campaign_id, &local)
}

pub async fn resolve_image_source_path(
    app: &AppHandle,
    state: &AppState,
    campaign_id: &str,
    local_path: Option<String>,
    absolute_source_path: Option<String>,
    campaign_image_id: Option<String>,
) -> AppResult<PathBuf> {
    if let Some(path) = absolute_source_path {
        let p = PathBuf::from(path.trim());
        if p.is_file() {
            return Ok(p);
        }
        return Err(AppError::NotFound("image_file".into()));
    }

    if let Some(image_id) = campaign_image_id {
        return resolve_campaign_image_file(app, state, campaign_id, &image_id).await;
    }

    if let Some(local) = local_path {
        let trimmed = local.trim();
        if trimmed.is_empty() {
            return Err(AppError::Internal("image_source_missing".into()));
        }
        return resolve_local_campaign_file(app, campaign_id, trimmed);
    }

    Err(AppError::Internal("image_source_missing".into()))
}

pub fn copy_into_map_image_dir(
    app: &AppHandle,
    campaign_id: &str,
    map_id: &str,
    source: &Path,
) -> AppResult<(String, String)> {
    let extension = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| matches!(e.as_str(), "jpg" | "jpeg" | "png" | "webp" | "gif"))
        .ok_or_else(|| AppError::Internal("image.unsupported_format".into()))?;

    let dest_dir = entity_image_dir(app, campaign_id, map_id)?;
    fs::create_dir_all(&dest_dir).map_err(|e| AppError::Internal(e.to_string()))?;
    let file_name = format!("background.{extension}");
    let dest_file = dest_dir.join(&file_name);
    fs::copy(source, &dest_file).map_err(|e| AppError::Internal(e.to_string()))?;
    let relative = format!("images/{map_id}/{file_name}");
    Ok((relative, dest_file.to_string_lossy().to_string()))
}
