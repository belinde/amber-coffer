use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::db::validate::ensure_campaign_exists;
use crate::db::AppState;
use crate::error::AppError;
use crate::models::{
    CampaignImageRow, CreateMapInput, Map, UpdateMapBackgroundInput, UpdateMapGridColsInput,
    TokenRow,
};
use crate::services::campaign_storage;
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

    let grid_rows = (existing.grid_cols as f64 * uploaded.height_px as f64
        / uploaded.width_px as f64)
        .ceil() as i32;

    let now = now_ms();
    let next_version = existing.version + 1;

    sqlx::query(
        r#"
        UPDATE maps
        SET image_path = ?, background_public_path = ?, width_px = ?, height_px = ?,
            grid_rows = ?, updated_at = ?, version = ?
        WHERE id = ?
        "#,
    )
    .bind(&relative_path)
    .bind(&uploaded.public_path)
    .bind(uploaded.width_px as i32)
    .bind(uploaded.height_px as i32)
    .bind(grid_rows)
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

#[tauri::command]
pub async fn update_map_grid_cols(
    input: UpdateMapGridColsInput,
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

    let grid_cols = input.grid_cols.clamp(8, 48);

    let grid_rows = if existing.width_px > 0 && existing.height_px > 0 {
        (grid_cols as f64 * existing.height_px as f64 / existing.width_px as f64).ceil() as i32
    } else {
        tabletop_defaults::GRID_ROWS
    };

    // Clamp board tokens that fall outside the new grid boundaries
    let board_tokens = sqlx::query_as::<_, TokenRow>(
        "SELECT id, map_id, entity_kind, entity_id, session_id, display_name, zone, x_cell, y_cell, bench_slot, visible_to_players, controlled_by_discord_id, created_at, updated_at, version FROM tokens WHERE map_id = ? AND zone = 'board'",
    )
    .bind(&input.map_id)
    .fetch_all(&pool)
    .await?;

    let now = now_ms();

    for token in &board_tokens {
        let x = token.x_cell.unwrap_or(0);
        let y = token.y_cell.unwrap_or(0);
        if x >= grid_cols || y >= grid_rows {
            let clamped_x = x.min(grid_cols - 1);
            let clamped_y = y.min(grid_rows - 1);
            sqlx::query(
                "UPDATE tokens SET x_cell = ?, y_cell = ?, updated_at = ?, version = version + 1 WHERE id = ?",
            )
            .bind(clamped_x)
            .bind(clamped_y)
            .bind(now)
            .bind(&token.id)
            .execute(&pool)
            .await?;
        }
    }

    let next_version = existing.version + 1;

    sqlx::query(
        r#"
        UPDATE maps
        SET grid_cols = ?, grid_rows = ?, updated_at = ?, version = ?
        WHERE id = ?
        "#,
    )
    .bind(grid_cols)
    .bind(grid_rows)
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

#[tauri::command]
pub async fn set_map_background_from_image_cmd(
    map_id: String,
    campaign_image_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Map, AppError> {
    let pool = state.pool_for_entity_id(&app, &map_id).await?;

    // Load the map
    let query = format!("{MAP_SELECT} WHERE id = ?");
    let existing = sqlx::query_as::<_, Map>(&query)
        .bind(&map_id)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("map {map_id}")))?;

    // Load the CampaignImage to get its local file path
    let img_row = sqlx::query_as::<_, CampaignImageRow>(
        r#"SELECT id, campaign_id, title, caption, image_ref_json, visibility, links_json,
                  created_at, updated_at, version
           FROM campaign_images WHERE id = ?"#,
    )
    .bind(&campaign_image_id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("campaign_image {campaign_image_id}")))?;

    // Extract the local relative path from image_ref_json
    let image_ref: crate::models::vault_json::ImageRef = img_row
        .image_ref_json
        .as_deref()
        .and_then(|json| serde_json::from_str(json).ok())
        .unwrap_or_default();

    let local_path = image_ref
        .local
        .ok_or_else(|| AppError::NotFound("campaign_image has no local file".into()))?;

    // Resolve the absolute path from the campaign storage folder
    let campaign_folder =
        campaign_storage::resolve_storage_folder(&app, &existing.campaign_id)?;
    let absolute_path = campaign_folder.join(&local_path);

    if !absolute_path.is_file() {
        return Err(AppError::NotFound(format!(
            "image file not found: {}",
            absolute_path.display()
        )));
    }

    // Read image dimensions using the image crate
    let img = image::open(&absolute_path).map_err(|e| {
        AppError::Internal(format!(
            "failed to read image {}: {e}",
            absolute_path.display()
        ))
    })?;
    let (width_px, height_px) = image::GenericImageView::dimensions(&img);

    // Derive gridRows = max(1, round(gridCols * heightPx / widthPx))
    let grid_rows = if width_px > 0 {
        1i32.max(
            (existing.grid_cols as f64 * height_px as f64 / width_px as f64).round() as i32,
        )
    } else {
        1
    };

    let now = now_ms();
    let next_version = existing.version + 1;

    // Public path for the player-activity (relative, served via CloudFront proxy)
    let background_public_path = format!(
        "/campaign-images/{}/{}",
        existing.campaign_id,
        format!("{}.webp", campaign_image_id)
    );

    sqlx::query(
        r#"
        UPDATE maps
        SET image_path = ?, background_public_path = ?, width_px = ?, height_px = ?, grid_rows = ?,
            updated_at = ?, version = ?
        WHERE id = ?
        "#,
    )
    .bind(&local_path)
    .bind(&background_public_path)
    .bind(width_px as i32)
    .bind(height_px as i32)
    .bind(grid_rows)
    .bind(now)
    .bind(next_version)
    .bind(&map_id)
    .execute(&pool)
    .await?;

    sqlx::query_as::<_, Map>(&query)
        .bind(&map_id)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| AppError::Internal("map update succeeded but row missing".into()))
}
