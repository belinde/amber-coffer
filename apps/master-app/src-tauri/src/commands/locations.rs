use tauri::State;
use uuid::Uuid;

use crate::commands::vault_validate::validate_visibility;
use crate::db::validate::{
    ensure_campaign_exists, ensure_parent_location, validate_events_interesting,
};
use crate::db::AppState;
use crate::error::AppError;
use crate::validation_issue::required_field;
use crate::models::{CreateLocationInput, Location, LocationRow, UpdateLocationInput};
use crate::util::now_ms;

const LOCATION_SELECT: &str = r#"
        SELECT id, campaign_id, parent_id, name, region, kind, population, visibility,
               appearance_json, sections_json, events_interesting_json, image_ref_json,
               description, coordinates_json, created_at, updated_at, version
        FROM locations
"#;

#[tauri::command]
pub async fn list_locations(
    campaign_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Location>, AppError> {
    let query = format!("{LOCATION_SELECT} WHERE campaign_id = ? ORDER BY name COLLATE NOCASE");
    let rows = sqlx::query_as::<_, LocationRow>(&query)
        .bind(&campaign_id)
        .fetch_all(state.pool())
        .await?;

    Ok(rows.into_iter().map(Location::from_row).collect())
}

#[tauri::command]
pub async fn get_location(id: String, state: State<'_, AppState>) -> Result<Option<Location>, AppError> {
    let query = format!("{LOCATION_SELECT} WHERE id = ?");
    let row = sqlx::query_as::<_, LocationRow>(&query)
        .bind(&id)
        .fetch_optional(state.pool())
        .await?;

    Ok(row.map(Location::from_row))
}

#[tauri::command]
pub async fn create_location(
    input: CreateLocationInput,
    state: State<'_, AppState>,
) -> Result<Location, AppError> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(required_field(&["name"]));
    }
    validate_visibility(&input.visibility)?;
    ensure_campaign_exists(state.pool(), &input.campaign_id).await?;

    if let Some(ref parent_id) = input.parent_id {
        ensure_parent_location(state.pool(), parent_id, &input.campaign_id, None).await?;
    }
    validate_events_interesting(state.pool(), &input.campaign_id, &input.events_interesting).await?;

    let id = Uuid::now_v7().to_string();
    let now = now_ms();
    let appearance_json = serde_json::to_string(&input.appearance)?;
    let sections_json = serde_json::to_string(&input.sections)?;
    let events_interesting_json = serde_json::to_string(&input.events_interesting)?;
    let image_ref_json = input
        .image
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;
    let coordinates_json = input
        .coordinates
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;

    sqlx::query(
        r#"
        INSERT INTO locations (
            id, campaign_id, parent_id, name, region, kind, population, visibility,
            appearance_json, sections_json, events_interesting_json, image_ref_json,
            description, coordinates_json, created_at, updated_at, version
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(&id)
    .bind(&input.campaign_id)
    .bind(&input.parent_id)
    .bind(name)
    .bind(&input.region)
    .bind(&input.kind)
    .bind(&input.population)
    .bind(&input.visibility)
    .bind(&appearance_json)
    .bind(&sections_json)
    .bind(&events_interesting_json)
    .bind(&image_ref_json)
    .bind(&input.description)
    .bind(&coordinates_json)
    .bind(now)
    .bind(now)
    .execute(state.pool())
    .await?;

    get_location(id, state)
        .await?
        .ok_or_else(|| AppError::Internal("location insert succeeded but row missing".into()))
}

#[tauri::command]
pub async fn update_location(
    input: UpdateLocationInput,
    state: State<'_, AppState>,
) -> Result<Location, AppError> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(required_field(&["name"]));
    }
    validate_visibility(&input.visibility)?;

    let existing = get_location(input.id.clone(), state.clone())
        .await?
        .ok_or_else(|| AppError::NotFound("location".into()))?;

    if let Some(ref parent_id) = input.parent_id {
        ensure_parent_location(
            state.pool(),
            parent_id,
            &existing.campaign_id,
            Some(&input.id),
        )
        .await?;
    }
    validate_events_interesting(state.pool(), &existing.campaign_id, &input.events_interesting).await?;

    let now = now_ms();
    let appearance_json = serde_json::to_string(&input.appearance)?;
    let sections_json = serde_json::to_string(&input.sections)?;
    let events_interesting_json = serde_json::to_string(&input.events_interesting)?;
    let image_ref_json = input
        .image
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;
    let coordinates_json = input
        .coordinates
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;
    let next_version = existing.version + 1;

    let updated = sqlx::query(
        r#"
        UPDATE locations
        SET parent_id = ?, name = ?, region = ?, kind = ?, population = ?, visibility = ?,
            appearance_json = ?, sections_json = ?, events_interesting_json = ?,
            image_ref_json = ?, description = ?, coordinates_json = ?,
            updated_at = ?, version = ?
        WHERE id = ?
        "#,
    )
    .bind(&input.parent_id)
    .bind(name)
    .bind(&input.region)
    .bind(&input.kind)
    .bind(&input.population)
    .bind(&input.visibility)
    .bind(&appearance_json)
    .bind(&sections_json)
    .bind(&events_interesting_json)
    .bind(&image_ref_json)
    .bind(&input.description)
    .bind(&coordinates_json)
    .bind(now)
    .bind(next_version)
    .bind(&input.id)
    .execute(state.pool())
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound("location".into()));
    }

    get_location(input.id, state)
        .await?
        .ok_or_else(|| AppError::Internal("location update succeeded but row missing".into()))
}

#[tauri::command]
pub async fn delete_location(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    let result = sqlx::query("DELETE FROM locations WHERE id = ?")
        .bind(&id)
        .execute(state.pool())
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("location".into()));
    }
    Ok(())
}
