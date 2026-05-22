use std::path::PathBuf;

use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::{Handout, HandoutRow, ShareImageAsHandoutInput};
use crate::services::image_source::resolve_image_source_path;
use crate::services::session_assets::upload_session_image;
use crate::util::now_ms;

const HANDOUT_SELECT: &str = r#"
        SELECT id, campaign_id, session_id, label, body,
               image_local_path, image_thumbnail_url, image_canon_url, image_hash,
               visible_to_players, shown_at, created_at, updated_at, version
        FROM handouts
"#;

async fn fetch_handout(pool: &sqlx::SqlitePool, id: &str) -> AppResult<Handout> {
    let query = format!("{HANDOUT_SELECT} WHERE id = ?");
    let row = sqlx::query_as::<_, HandoutRow>(&query)
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("handout {id}")))?;
    Ok(Handout::from_row(row))
}

async fn ensure_live_session(pool: &sqlx::SqlitePool, session_id: &str) -> AppResult<(String,)> {
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT campaign_id, play_state FROM sessions WHERE id = ?",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?;

    let (campaign_id, play_state) =
        row.ok_or_else(|| AppError::NotFound(format!("session {session_id}")))?;
    if play_state != "live" {
        return Err(AppError::Internal("session_not_live".into()));
    }
    Ok((campaign_id,))
}

#[tauri::command]
pub async fn list_handouts(
    session_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<Handout>, AppError> {
    let pool = state.pool_for_entity_id(&app, &session_id).await?;
    let query = format!("{HANDOUT_SELECT} WHERE session_id = ? ORDER BY created_at DESC");
    let rows = sqlx::query_as::<_, HandoutRow>(&query)
        .bind(&session_id)
        .fetch_all(&pool)
        .await?;
    Ok(rows.into_iter().map(Handout::from_row).collect())
}

#[tauri::command]
pub async fn create_handout(
    session_id: String,
    label: String,
    body: Option<String>,
    image_local_path: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Handout, AppError> {
    let pool = state.pool_for_entity_id(&app, &session_id).await?;
    let (campaign_id,) = ensure_live_session(&pool, &session_id).await?;

    let trimmed_label = label.trim();
    if trimmed_label.is_empty() {
        return Err(AppError::Internal("handout_label_required".into()));
    }

    let id = Uuid::now_v7().to_string();
    let now = now_ms();

    sqlx::query(
        r#"
        INSERT INTO handouts (
            id, campaign_id, session_id, label, body,
            image_local_path, image_thumbnail_url, image_canon_url, image_hash,
            visible_to_players, shown_at, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, NULL, ?, ?, 1)
        "#,
    )
    .bind(&id)
    .bind(&campaign_id)
    .bind(&session_id)
    .bind(trimmed_label)
    .bind(body.as_deref())
    .bind(image_local_path.as_deref())
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await?;

    fetch_handout(&pool, &id).await
}

async fn upload_handout_image_if_needed(
    app: &AppHandle,
    state: &AppState,
    handout: &Handout,
    session_token: &str,
    sync_api_base_url: &str,
) -> AppResult<(String, String)> {
    if let Some(url) = handout
        .image
        .as_ref()
        .and_then(|i| i.thumbnail_url.as_ref())
    {
        if !url.is_empty() {
            return Ok((
                url.clone(),
                handout
                    .image
                    .as_ref()
                    .and_then(|i| i.hash.clone())
                    .unwrap_or_default(),
            ));
        }
    }

    let local = handout
        .image
        .as_ref()
        .and_then(|i| i.local_path.clone())
        .ok_or_else(|| AppError::Internal("handout_image_missing".into()))?;

    let source = resolve_image_source_path(
        app,
        state,
        &handout.campaign_id,
        Some(local),
        None,
        None,
    )
    .await?;

    let uploaded = upload_session_image(
        sync_api_base_url,
        session_token,
        &handout.campaign_id,
        &handout.session_id,
        "handout",
        &source,
        1600,
    )
    .await?;

    Ok((uploaded.public_path, uploaded.hash))
}

#[tauri::command]
pub async fn share_handout(
    handout_id: String,
    session_token: String,
    sync_api_base_url: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Handout, AppError> {
    let pool = state.pool_for_entity_id(&app, &handout_id).await?;
    let mut handout = fetch_handout(&pool, &handout_id).await?;
    ensure_live_session(&pool, &handout.session_id).await?;

    let (public_path, hash) =
        upload_handout_image_if_needed(&app, &state, &handout, &session_token, &sync_api_base_url)
            .await?;

    let now = now_ms();
    sqlx::query(
        r#"
        UPDATE handouts
        SET image_thumbnail_url = ?, image_hash = ?, visible_to_players = 1,
            shown_at = ?, updated_at = ?, version = version + 1
        WHERE id = ?
        "#,
    )
    .bind(&public_path)
    .bind(&hash)
    .bind(now)
    .bind(now)
    .bind(&handout_id)
    .execute(&pool)
    .await?;

    handout = fetch_handout(&pool, &handout_id).await?;
    Ok(handout)
}

#[tauri::command]
pub async fn hide_handout(handout_id: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    let pool = state.pool_for_entity_id(&app, &handout_id).await?;
    let handout = fetch_handout(&pool, &handout_id).await?;
    ensure_live_session(&pool, &handout.session_id).await?;

    let now = now_ms();
    sqlx::query(
        "UPDATE handouts SET visible_to_players = 0, updated_at = ?, version = version + 1 WHERE id = ?",
    )
    .bind(now)
    .bind(&handout_id)
    .execute(&pool)
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn share_image_as_handout(
    input: ShareImageAsHandoutInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Handout, AppError> {
    let pool = state.pool_for_entity_id(&app, &input.session_id).await?;
    let (campaign_id,) = ensure_live_session(&pool, &input.session_id).await?;
    if campaign_id != input.campaign_id {
        return Err(AppError::Internal("campaign_session_mismatch".into()));
    }

    let trimmed_label = input.label.trim();
    if trimmed_label.is_empty() {
        return Err(AppError::Internal("handout_label_required".into()));
    }

    let source = resolve_image_source_path(
        &app,
        &state,
        &input.campaign_id,
        input.local_path.clone(),
        input.absolute_source_path.clone(),
        input.campaign_image_id.clone(),
    )
    .await?;

    let local_copy = copy_handout_local_path(&app, &campaign_id, &source)?;

    let id = Uuid::now_v7().to_string();
    let now = now_ms();

    sqlx::query(
        r#"
        INSERT INTO handouts (
            id, campaign_id, session_id, label, body,
            image_local_path, image_thumbnail_url, image_canon_url, image_hash,
            visible_to_players, shown_at, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, 0, NULL, ?, ?, 1)
        "#,
    )
    .bind(&id)
    .bind(&campaign_id)
    .bind(&input.session_id)
    .bind(trimmed_label)
    .bind(&local_copy)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await?;

  share_handout(
        id,
        input.session_token,
        input.sync_api_base_url,
        app,
        state,
    )
    .await
}

fn copy_handout_local_path(app: &AppHandle, campaign_id: &str, source: &PathBuf) -> AppResult<String> {
    use std::fs;

    use crate::services::import_images::entity_image_dir;

    let handout_id = Uuid::now_v7().to_string();
    let extension = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_else(|| "jpg".to_string());

    let dest_dir = entity_image_dir(app, campaign_id, &handout_id)?;
    fs::create_dir_all(&dest_dir).map_err(|e| AppError::Internal(e.to_string()))?;
    let file_name = format!("source.{extension}");
    let dest_file = dest_dir.join(&file_name);
    fs::copy(source, &dest_file).map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(format!("images/{handout_id}/{file_name}"))
}
