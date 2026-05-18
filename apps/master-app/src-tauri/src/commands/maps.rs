use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::db::validate::ensure_campaign_exists;
use crate::db::AppState;
use crate::error::AppError;
use crate::models::{CreateMapInput, Map};
use crate::util::now_ms;

const MAP_SELECT: &str = r#"
        SELECT id, campaign_id, name, image_path, width_px, height_px, grid_size_px,
               grid_cols, grid_rows, bench_slots, created_at, updated_at, version
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
          id, campaign_id, name, image_path, width_px, height_px, grid_size_px,
          grid_cols, grid_rows, bench_slots, created_at, updated_at, version
        ) VALUES (?, ?, ?, '', 1920, 1440, 50, 24, 18, 12, ?, ?, 1)
        "#,
    )
    .bind(&id)
    .bind(&input.campaign_id)
    .bind(name.trim())
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await?;

    let query = format!("{MAP_SELECT} WHERE id = ?");
    sqlx::query_as::<_, Map>(&query)
        .bind(&id)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| AppError::Internal("map insert succeeded but row missing".into()))
}
