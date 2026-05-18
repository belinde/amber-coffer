use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::commands::vault_validate::{validate_faction_kind, validate_visibility};
use crate::db::validate::{
    ensure_campaign_exists, ensure_location_in_campaign, ensure_parent_faction,
    validate_events_interesting,
};
use crate::db::AppState;
use crate::error::AppError;
use crate::validation_issue::required_field;
use crate::models::{CreateFactionInput, Faction, FactionRow, UpdateFactionInput};
use crate::util::now_ms;

const FACTION_SELECT: &str = r#"
        SELECT id, campaign_id, name, faction_kind, parent_faction_id,
               headquarters_location_id, goals, secrets, description,
               events_interesting_json, image_ref_json, visibility,
               created_at, updated_at, version
        FROM factions
"#;

#[tauri::command]
pub async fn list_factions(
    campaign_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<Faction>, AppError> {
    let pool = state.pool_for_campaign(&app, &campaign_id).await?;
    let query = format!("{FACTION_SELECT} WHERE campaign_id = ? ORDER BY name COLLATE NOCASE");
    let rows = sqlx::query_as::<_, FactionRow>(&query)
        .bind(&campaign_id)
        .fetch_all(&pool)
        .await?;

    Ok(rows.into_iter().map(Faction::from_row).collect())
}

#[tauri::command]
pub async fn get_faction(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>) -> Result<Option<Faction>, AppError> {
    let pool = state.pool_for_entity_id(&app, &id).await?;
    let query = format!("{FACTION_SELECT} WHERE id = ?");
    let row = sqlx::query_as::<_, FactionRow>(&query)
        .bind(&id)
        .fetch_optional(&pool)
        .await?;

    Ok(row.map(Faction::from_row))
}

#[tauri::command]
pub async fn create_faction(
    input: CreateFactionInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Faction, AppError> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(required_field(&["name"]));
    }
    validate_visibility(&input.visibility)?;
    validate_faction_kind(input.kind.as_deref())?;
    ensure_campaign_exists(&app, &input.campaign_id).await?;


    let pool = state.pool_for_campaign(&app, &input.campaign_id).await?;
    if let Some(ref hq) = input.headquarters_location_id {
        ensure_location_in_campaign(&pool, hq, &input.campaign_id).await?;
    }
    if let Some(ref parent_id) = input.parent_faction_id {
        ensure_parent_faction(&pool, parent_id, &input.campaign_id, None).await?;
    }
    validate_events_interesting(&pool, &input.campaign_id, &input.events_interesting).await?;

    let id = Uuid::now_v7().to_string();
    let now = now_ms();
    let events_interesting_json = serde_json::to_string(&input.events_interesting)?;
    let image_ref_json = input
        .image
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;

    sqlx::query(
        r#"
        INSERT INTO factions (
            id, campaign_id, name, faction_kind, parent_faction_id,
            headquarters_location_id, goals, secrets, description,
            events_interesting_json, image_ref_json, visibility,
            created_at, updated_at, version
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(&id)
    .bind(&input.campaign_id)
    .bind(name)
    .bind(&input.kind)
    .bind(&input.parent_faction_id)
    .bind(&input.headquarters_location_id)
    .bind(&input.goals)
    .bind(&input.secrets)
    .bind(&input.description)
    .bind(&events_interesting_json)
    .bind(&image_ref_json)
    .bind(&input.visibility)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await?;

    get_faction(id, app, state)
        .await?
        .ok_or_else(|| AppError::Internal("faction insert succeeded but row missing".into()))
}

#[tauri::command]
pub async fn update_faction(
    input: UpdateFactionInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Faction, AppError> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(required_field(&["name"]));
    }
    validate_visibility(&input.visibility)?;
    validate_faction_kind(input.kind.as_deref())?;

    let existing = get_faction(input.id.clone(), app.clone(), state.clone())
        .await?
        .ok_or_else(|| AppError::NotFound("faction".into()))?;

    let pool = state.pool_for_campaign(&app, &existing.campaign_id).await?;
    if let Some(ref hq) = input.headquarters_location_id {
        ensure_location_in_campaign(&pool, hq, &existing.campaign_id).await?;
    }
    if let Some(ref parent_id) = input.parent_faction_id {
        ensure_parent_faction(
            &pool,
            parent_id,
            &existing.campaign_id,
            Some(&input.id),
        )
        .await?;
    }
    validate_events_interesting(&pool, &existing.campaign_id, &input.events_interesting).await?;

    let now = now_ms();
    let events_interesting_json = serde_json::to_string(&input.events_interesting)?;
    let image_ref_json = input
        .image
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;
    let next_version = existing.version + 1;

    let updated = sqlx::query(
        r#"
        UPDATE factions
        SET name = ?, faction_kind = ?, parent_faction_id = ?,
            headquarters_location_id = ?, goals = ?, secrets = ?, description = ?,
            events_interesting_json = ?, image_ref_json = ?, visibility = ?,
            updated_at = ?, version = ?
        WHERE id = ?
        "#,
    )
    .bind(name)
    .bind(&input.kind)
    .bind(&input.parent_faction_id)
    .bind(&input.headquarters_location_id)
    .bind(&input.goals)
    .bind(&input.secrets)
    .bind(&input.description)
    .bind(&events_interesting_json)
    .bind(&image_ref_json)
    .bind(&input.visibility)
    .bind(now)
    .bind(next_version)
    .bind(&input.id)
    .execute(&pool)
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound("faction".into()));
    }

    get_faction(input.id, app, state)
        .await?
        .ok_or_else(|| AppError::Internal("faction update succeeded but row missing".into()))
}

#[tauri::command]
pub async fn delete_faction(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>) -> Result<(), AppError> {
    let pool = state.pool_for_entity_id(&app, &id).await?;
    let result = sqlx::query("DELETE FROM factions WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("faction".into()));
    }
    Ok(())
}
