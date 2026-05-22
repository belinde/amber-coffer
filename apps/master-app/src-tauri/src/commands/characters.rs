use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::commands::vault_validate::validate_visibility;
use crate::db::validate::{
    ensure_campaign_exists, ensure_location_in_campaign, validate_events_interesting,
};
use crate::db::AppState;
use crate::error::AppError;
use crate::validation_issue::{enum_invalid, required_field, validation_issues, ValidationIssue};
use crate::models::{Character, CharacterRow, CreateCharacterInput, UpdateCharacterInput};
use crate::services::tabletop_tokens;
use crate::util::now_ms;

const VALID_STATUSES: &[&str] = &["active", "retired", "deceased"];

const CHARACTER_SELECT: &str = r#"
        SELECT id, campaign_id, name, player_discord_id, current_location_id,
               species, role_hint, game_system_hint, gm_notes, visibility,
               appearance_json, game_stats_json, notable_equipment_json,
               events_interesting_json, image_ref_json, status,
               created_at, updated_at, version
        FROM characters
"#;

#[tauri::command]
pub async fn list_characters(
    campaign_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<Character>, AppError> {
    let pool = state.pool_for_campaign(&app, &campaign_id).await?;
    let query = format!(
        "{CHARACTER_SELECT} WHERE campaign_id = ? ORDER BY name COLLATE NOCASE"
    );
    let rows = sqlx::query_as::<_, CharacterRow>(&query)
        .bind(&campaign_id)
        .fetch_all(&pool)
        .await?;

    Ok(rows.into_iter().map(Character::from_row).collect())
}

#[tauri::command]
pub async fn get_character(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<Character>, AppError> {
    let pool = state.pool_for_entity_id(&app, &id).await?;
    let query = format!("{CHARACTER_SELECT} WHERE id = ?");
    let row = sqlx::query_as::<_, CharacterRow>(&query)
        .bind(&id)
        .fetch_optional(&pool)
        .await?;

    Ok(row.map(Character::from_row))
}

#[tauri::command]
pub async fn create_character(
    input: CreateCharacterInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Character, AppError> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(required_field(&["name"]));
    }
    validate_status(&input.status)?;
    validate_visibility(&input.visibility)?;

    ensure_campaign_exists(&app, &input.campaign_id).await?;
    let pool = state.pool_for_campaign(&app, &input.campaign_id).await?;

    if let Some(ref location_id) = input.current_location_id {
        ensure_location_in_campaign(&pool, location_id, &input.campaign_id).await?;
    }
    validate_events_interesting(&pool, &input.campaign_id, &input.events_interesting).await?;

    let id = Uuid::now_v7().to_string();
    let now = now_ms();
    let appearance_json = serde_json::to_string(&input.appearance)?;
    let game_stats_json = serde_json::to_string(&input.game_stats)?;
    let notable_equipment_json = serde_json::to_string(&input.notable_equipment)?;
    let events_interesting_json = serde_json::to_string(&input.events_interesting)?;
    let image_ref_json = input
        .image
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;

    sqlx::query(
        r#"
        INSERT INTO characters (
            id, campaign_id, name, player_discord_id, current_location_id,
            species, role_hint, game_system_hint, gm_notes, visibility,
            appearance_json, game_stats_json, notable_equipment_json,
            events_interesting_json, image_ref_json, attributes_json, status,
            created_at, updated_at, version
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(&id)
    .bind(&input.campaign_id)
    .bind(name)
    .bind(&input.player_discord_id)
    .bind(&input.current_location_id)
    .bind(&input.species)
    .bind(&input.role_hint)
    .bind(&input.game_system_hint)
    .bind(&input.gm_notes)
    .bind(&input.visibility)
    .bind(&appearance_json)
    .bind(&game_stats_json)
    .bind(&notable_equipment_json)
    .bind(&events_interesting_json)
    .bind(&image_ref_json)
    .bind(&game_stats_json)
    .bind(&input.status)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(map_character_player_discord_error)?;

    let _ = tabletop_tokens::ensure_character_tokens_for_campaign(&pool, &input.campaign_id).await;

    get_character(id, app, state)
        .await?
        .ok_or_else(|| AppError::Internal("character insert succeeded but row missing".into()))
}

#[tauri::command]
pub async fn update_character(
    input: UpdateCharacterInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Character, AppError> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(required_field(&["name"]));
    }
    validate_status(&input.status)?;
    validate_visibility(&input.visibility)?;

    let existing = get_character(input.id.clone(), app.clone(), state.clone())
        .await?
        .ok_or_else(|| AppError::NotFound("character".into()))?;
    let pool = state.pool_for_campaign(&app, &existing.campaign_id).await?;

    if let Some(ref location_id) = input.current_location_id {
        ensure_location_in_campaign(&pool, location_id, &existing.campaign_id).await?;
    }
    validate_events_interesting(&pool, &existing.campaign_id, &input.events_interesting).await?;

    let now = now_ms();
    let appearance_json = serde_json::to_string(&input.appearance)?;
    let game_stats_json = serde_json::to_string(&input.game_stats)?;
    let notable_equipment_json = serde_json::to_string(&input.notable_equipment)?;
    let events_interesting_json = serde_json::to_string(&input.events_interesting)?;
    let image_ref_json = input
        .image
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;
    let next_version = existing.version + 1;

    let updated = sqlx::query(
        r#"
        UPDATE characters
        SET name = ?, player_discord_id = ?, current_location_id = ?,
            species = ?, role_hint = ?, game_system_hint = ?, gm_notes = ?, visibility = ?,
            appearance_json = ?, game_stats_json = ?, notable_equipment_json = ?,
            events_interesting_json = ?, image_ref_json = ?, attributes_json = ?, status = ?,
            updated_at = ?, version = ?
        WHERE id = ?
        "#,
    )
    .bind(name)
    .bind(&input.player_discord_id)
    .bind(&input.current_location_id)
    .bind(&input.species)
    .bind(&input.role_hint)
    .bind(&input.game_system_hint)
    .bind(&input.gm_notes)
    .bind(&input.visibility)
    .bind(&appearance_json)
    .bind(&game_stats_json)
    .bind(&notable_equipment_json)
    .bind(&events_interesting_json)
    .bind(&image_ref_json)
    .bind(&game_stats_json)
    .bind(&input.status)
    .bind(now)
    .bind(next_version)
    .bind(&input.id)
    .execute(&pool)
    .await
    .map_err(map_character_player_discord_error)?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound("character".into()));
    }

    let _ =
        tabletop_tokens::ensure_character_tokens_for_campaign(&pool, &existing.campaign_id).await;

    get_character(input.id, app, state)
        .await?
        .ok_or_else(|| AppError::Internal("character update succeeded but row missing".into()))
}

#[tauri::command]
pub async fn delete_character(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let pool = state.pool_for_entity_id(&app, &id).await?;
    let result = sqlx::query("DELETE FROM characters WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("character".into()));
    }

    Ok(())
}

fn validate_status(status: &str) -> Result<(), AppError> {
    if VALID_STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(enum_invalid(&["status"]))
    }
}

fn map_character_player_discord_error(err: sqlx::Error) -> AppError {
    if let sqlx::Error::Database(db_err) = &err {
        if db_err.is_unique_violation() {
            return validation_issues(vec![ValidationIssue::new(
                &["playerDiscordId"],
                "player_discord_id.duplicate",
            )]);
        }
    }
    AppError::Database(err)
}
