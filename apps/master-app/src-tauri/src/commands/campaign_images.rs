use std::fs;
use std::path::Path;

use sha2::{Digest, Sha256};
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::commands::vault_validate::{validate_title_not_empty, validate_visibility};
use crate::db::validate::{ensure_campaign_exists, validate_image_links};
use crate::db::AppState;
use crate::error::AppError;
use crate::models::vault_json::ImageRef;
use crate::models::{
    CampaignImage, CampaignImageRow, CreateCampaignImageInput, UpdateCampaignImageInput,
};
use crate::services::campaign_storage;
use crate::services::import_images::entity_image_dir;
use crate::util::now_ms;

const CAMPAIGN_IMAGE_SELECT: &str = r#"
        SELECT id, campaign_id, title, caption, image_ref_json, visibility, links_json,
               created_at, updated_at, version
        FROM campaign_images
"#;

const ALLOWED_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif"];

fn extension_from_path(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .filter(|ext| ALLOWED_EXTENSIONS.contains(&ext.as_str()))
}

fn hash_file(path: &Path) -> Result<String, AppError> {
    let bytes = fs::read(path).map_err(|e| AppError::Internal(e.to_string()))?;
    let digest = Sha256::digest(bytes);
    Ok(format!("{:x}", digest))
}

#[tauri::command]
pub async fn list_campaign_images(
    campaign_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<CampaignImage>, AppError> {
    let pool = state.pool_for_campaign(&app, &campaign_id).await?;
    let query = format!("{CAMPAIGN_IMAGE_SELECT} WHERE campaign_id = ? ORDER BY title COLLATE NOCASE");
    let rows = sqlx::query_as::<_, CampaignImageRow>(&query)
        .bind(&campaign_id)
        .fetch_all(&pool)
        .await?;

    Ok(rows.into_iter().map(CampaignImage::from_row).collect())
}

#[tauri::command]
pub async fn get_campaign_image(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<CampaignImage>, AppError> {
    let pool = state.pool_for_entity_id(&app, &id).await?;
    let query = format!("{CAMPAIGN_IMAGE_SELECT} WHERE id = ?");
    let row = sqlx::query_as::<_, CampaignImageRow>(&query)
        .bind(&id)
        .fetch_optional(&pool)
        .await?;

    Ok(row.map(CampaignImage::from_row))
}

#[tauri::command]
pub async fn create_campaign_image(
    input: CreateCampaignImageInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<CampaignImage, AppError> {
    let title = input.title.trim();
    validate_title_not_empty(title)?;
    validate_visibility(&input.visibility)?;
    ensure_campaign_exists(&app, &input.campaign_id).await?;
    let pool = state.pool_for_campaign(&app, &input.campaign_id).await?;
    validate_image_links(&pool, &input.campaign_id, &input.links).await?;

    let id = Uuid::now_v7().to_string();
    let now = now_ms();
    let links_json = serde_json::to_string(&input.links)?;

    sqlx::query(
        r#"
        INSERT INTO campaign_images (
            id, campaign_id, title, caption, image_ref_json, visibility, links_json,
            created_at, updated_at, version
        )
        VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(&id)
    .bind(&input.campaign_id)
    .bind(title)
    .bind(input.caption.trim())
    .bind(&input.visibility)
    .bind(&links_json)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await?;

    get_campaign_image(id, app, state)
        .await?
        .ok_or_else(|| AppError::Internal("campaign image insert succeeded but row missing".into()))
}

#[tauri::command]
pub async fn update_campaign_image(
    input: UpdateCampaignImageInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<CampaignImage, AppError> {
    let title = input.title.trim();
    validate_title_not_empty(title)?;
    validate_visibility(&input.visibility)?;

    let existing = get_campaign_image(input.id.clone(), app.clone(), state.clone())
        .await?
        .ok_or_else(|| AppError::NotFound("campaign_image".into()))?;
    let pool = state.pool_for_campaign(&app, &existing.campaign_id).await?;

    validate_image_links(&pool, &existing.campaign_id, &input.links).await?;

    let now = now_ms();
    let links_json = serde_json::to_string(&input.links)?;
    let next_version = existing.version + 1;

    let updated = sqlx::query(
        r#"
        UPDATE campaign_images
        SET title = ?, caption = ?, visibility = ?, links_json = ?, updated_at = ?, version = ?
        WHERE id = ?
        "#,
    )
    .bind(title)
    .bind(input.caption.trim())
    .bind(&input.visibility)
    .bind(&links_json)
    .bind(now)
    .bind(next_version)
    .bind(&input.id)
    .execute(&pool)
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound("campaign_image".into()));
    }

    get_campaign_image(input.id, app, state)
        .await?
        .ok_or_else(|| AppError::Internal("campaign image update succeeded but row missing".into()))
}

#[tauri::command]
pub async fn delete_campaign_image(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let pool = state.pool_for_entity_id(&app, &id).await?;
    let existing = get_campaign_image(id.clone(), app.clone(), state.clone())
        .await?
        .ok_or_else(|| AppError::NotFound("campaign_image".into()))?;

    sqlx::query("DELETE FROM campaign_images WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await?;

    let dir = entity_image_dir(&app, &existing.campaign_id, &existing.id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| AppError::Internal(e.to_string()))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn attach_campaign_image_file(
    image_id: String,
    source_path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<CampaignImage, AppError> {
    let existing = get_campaign_image(image_id.clone(), app.clone(), state.clone())
        .await?
        .ok_or_else(|| AppError::NotFound("campaign_image".into()))?;
    let pool = state.pool_for_campaign(&app, &existing.campaign_id).await?;

    let source = std::path::PathBuf::from(&source_path);
    if !source.is_file() {
        return Err(AppError::NotFound("image_file".into()));
    }

    let extension = extension_from_path(&source).ok_or_else(|| {
        crate::validation_issue::validation_issues(vec![
            crate::validation_issue::ValidationIssue::new(
                &["sourcePath"],
                "image.unsupported_format",
            ),
        ])
    })?;

    let dest_dir = entity_image_dir(&app, &existing.campaign_id, &existing.id)?;
    fs::create_dir_all(&dest_dir).map_err(|e| AppError::Internal(e.to_string()))?;

    let file_name = format!("original.{extension}");
    let dest_file = dest_dir.join(&file_name);
    fs::copy(&source, &dest_file).map_err(|e| AppError::Internal(e.to_string()))?;

    let hash = hash_file(&dest_file)?;
    let local = format!("images/{}/{file_name}", existing.id);
    let image_ref = ImageRef {
        local: Some(local),
        hash: Some(hash),
        thumbnail_url: None,
        canon_url: None,
    };
    let image_ref_json = serde_json::to_string(&image_ref)?;
    let now = now_ms();
    let next_version = existing.version + 1;

    sqlx::query(
        r#"
        UPDATE campaign_images
        SET image_ref_json = ?, updated_at = ?, version = ?
        WHERE id = ?
        "#,
    )
    .bind(&image_ref_json)
    .bind(now)
    .bind(next_version)
    .bind(&image_id)
    .execute(&pool)
    .await?;

    get_campaign_image(image_id, app, state)
        .await?
        .ok_or_else(|| AppError::Internal("campaign image attach succeeded but row missing".into()))
}

#[tauri::command]
pub async fn resolve_campaign_image_path(
    campaign_id: String,
    local_path: String,
    app: AppHandle,
) -> Result<String, AppError> {
    if local_path.contains("..") || local_path.starts_with('/') {
        return Err(crate::validation_issue::generic_invalid(&["local"]));
    }

    let campaign_root = campaign_storage::resolve_storage_folder(&app, &campaign_id)?;
    let absolute = campaign_root.join(&local_path);
    if !absolute.starts_with(&campaign_root) {
        return Err(crate::validation_issue::generic_invalid(&["local"]));
    }

    if !absolute.is_file() {
        return Err(AppError::NotFound("image_file".into()));
    }

    absolute
        .into_os_string()
        .into_string()
        .map_err(|_| AppError::Internal("invalid image path encoding".into()))
}
