use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::db::validate::ensure_campaign_exists;
use crate::db::AppState;
use crate::error::AppError;
use crate::models::{CreateMapInput, Map, UpdateMapBackgroundInput};
use crate::services::image_source::{copy_into_map_image_dir, resolve_image_source_path};
use crate::services::session_assets::upload_session_image;
use crate::services::tabletop_tokens;
use crate::tabletop_defaults;
use crate::util::now_ms;

const MAP_SELECT: &str = r#"
        SELECT id, campaign_id, name, image_path, background_public_path, width_px, height_px,
               grid_size_px, grid_cols, grid_rows, bench_slots, created_at, updated_at, version
        FROM maps
"#;

#[tauri::command]
pub async fn list_maps(
    campaign_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<Map>, AppError> {
    ensure_campaign_exists(&app, &campaign_id).await?;
    let pool = state.pool_for_campaign(&app, &campaign_id).await?;
    let query = format!("{MAP_SELECT} WHERE campaign_id = ? ORDER BY name COLLATE NOCASE");
    let rows = sqlx::query_as::<_, Map>(&query)
        .bind(&campaign_id)
        .fetch_all(&pool)
        .await?;
    Ok(rows)
}

#[tauri::command]
pub async fn create_map(
    input: CreateMapInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Map, AppError> {
    ensure_campaign_exists(&app, &input.campaign_id).await?;
    let pool = state.pool_for_campaign(&app, &input.campaign_id).await?;

    let id = Uuid::now_v7().to_string();
    let now = now_ms();
    let name = input
        .name
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "Table 1".to_string());

    sqlx::query(
        r#"
        INSERT INTO maps (
          id, campaign_id, name, image_path, background_public_path, width_px, height_px,
          grid_size_px, grid_cols, grid_rows, bench_slots, created_at, updated_at, version
        ) VALUES (?, ?, ?, '', '', ?, ?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(&id)
    .bind(&input.campaign_id)
    .bind(name.trim())
    .bind(tabletop_defaults::VIEWPORT_WIDTH_PX)
    .bind(tabletop_defaults::VIEWPORT_HEIGHT_PX)
    .bind(tabletop_defaults::GRID_SIZE_PX)
    .bind(tabletop_defaults::GRID_COLS)
    .bind(tabletop_defaults::GRID_ROWS)
    .bind(tabletop_defaults::BENCH_SLOTS)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await?;

    let _ = tabletop_tokens::ensure_character_tokens_for_map(&pool, &id, &input.campaign_id).await;

    let query = format!("{MAP_SELECT} WHERE id = ?");
    sqlx::query_as::<_, Map>(&query)
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| AppError::Internal("map insert succeeded but row missing".into()))
}

async fn ensure_live_session_for_map(
    pool: &sqlx::SqlitePool,
    session_id: &str,
    campaign_id: &str,
) -> Result<(), AppError> {
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT campaign_id, play_state FROM sessions WHERE id = ?",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?;

    let (sid_campaign, play_state) =
        row.ok_or_else(|| AppError::NotFound(format!("session {session_id}")))?;
    if sid_campaign != campaign_id {
        return Err(AppError::Internal("campaign_session_mismatch".into()));
    }
    if play_state != "live" {
        return Err(AppError::Internal("session_not_live".into()));
    }
    Ok(())
}

#[tauri::command]
pub async fn update_map_background(
    input: UpdateMapBackgroundInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Map, AppError> {
    let pool = state.pool_for_entity_id(&app, &input.map_id).await?;
    ensure_live_session_for_map(&pool, &input.session_id, &input.campaign_id).await?;

    let query = format!("{MAP_SELECT} WHERE id = ?");
    let existing = sqlx::query_as::<_, Map>(&query)
        .bind(&input.map_id)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("map {}", input.map_id)))?;

    if existing.campaign_id != input.campaign_id {
        return Err(AppError::NotFound(format!("map {}", input.map_id)));
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

    let (relative_path, _) =
        copy_into_map_image_dir(&app, &input.campaign_id, &input.map_id, &source)?;

    let uploaded = upload_session_image(
        &input.sync_api_base_url,
        &input.session_token,
        &input.campaign_id,
        &input.session_id,
        "map-background",
        &source,
        1920,
    )
    .await?;

    let now = now_ms();
    let next_version = existing.version + 1;

    sqlx::query(
        r#"
        UPDATE maps
        SET image_path = ?, background_public_path = ?, width_px = ?, height_px = ?,
            updated_at = ?, version = ?
        WHERE id = ?
        "#,
    )
    .bind(&relative_path)
    .bind(&uploaded.public_path)
    .bind(uploaded.width_px as i32)
    .bind(uploaded.height_px as i32)
    .bind(now)
    .bind(next_version)
    .bind(&input.map_id)
    .execute(&pool)
    .await?;

    sqlx::query_as::<_, Map>(&query)
        .bind(&input.map_id)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| AppError::Internal("map update succeeded but row missing".into()))
}
