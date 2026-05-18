use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::commands::vault_validate::{validate_lore_kind, validate_visibility};
use crate::db::validate::ensure_campaign_exists;
use crate::db::AppState;
use crate::error::AppError;
use crate::validation_issue::required_field;
use crate::models::{CreateLoreNoteInput, LoreNote, LoreNoteRow, UpdateLoreNoteInput};
use crate::util::now_ms;

const LORE_NOTE_SELECT: &str = r#"
        SELECT id, campaign_id, title, kind, body, tags_json, visibility,
               linked_entities_json, created_at, updated_at, version
        FROM lore_notes
"#;

#[tauri::command]
pub async fn list_lore_notes(
    campaign_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<LoreNote>, AppError> {
    let pool = state.pool_for_campaign(&app, &campaign_id).await?;
    let query = format!("{LORE_NOTE_SELECT} WHERE campaign_id = ? ORDER BY title COLLATE NOCASE");
    let rows = sqlx::query_as::<_, LoreNoteRow>(&query)
        .bind(&campaign_id)
        .fetch_all(&pool)
        .await?;

    Ok(rows.into_iter().map(LoreNote::from_row).collect())
}

#[tauri::command]
pub async fn get_lore_note(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>) -> Result<Option<LoreNote>, AppError> {
    let pool = state.pool_for_entity_id(&app, &id).await?;
    let query = format!("{LORE_NOTE_SELECT} WHERE id = ?");
    let row = sqlx::query_as::<_, LoreNoteRow>(&query)
        .bind(&id)
        .fetch_optional(&pool)
        .await?;

    Ok(row.map(LoreNote::from_row))
}

#[tauri::command]
pub async fn create_lore_note(
    input: CreateLoreNoteInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<LoreNote, AppError> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(required_field(&["title"]));
    }
    validate_visibility(&input.visibility)?;
    validate_lore_kind(&input.kind)?;
    ensure_campaign_exists(&app, &input.campaign_id).await?;


    let pool = state.pool_for_campaign(&app, &input.campaign_id).await?;
    let id = Uuid::now_v7().to_string();
    let now = now_ms();
    let tags_json = serde_json::to_string(&input.tags)?;
    let linked_entities_json = serde_json::to_string(&input.linked_entities)?;

    sqlx::query(
        r#"
        INSERT INTO lore_notes (
            id, campaign_id, title, kind, body, tags_json, visibility,
            linked_entities_json, created_at, updated_at, version
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(&id)
    .bind(&input.campaign_id)
    .bind(title)
    .bind(&input.kind)
    .bind(&input.body)
    .bind(&tags_json)
    .bind(&input.visibility)
    .bind(&linked_entities_json)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await?;

    get_lore_note(id, app, state)
        .await?
        .ok_or_else(|| AppError::Internal("lore note insert succeeded but row missing".into()))
}

#[tauri::command]
pub async fn update_lore_note(
    input: UpdateLoreNoteInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<LoreNote, AppError> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(required_field(&["title"]));
    }
    validate_visibility(&input.visibility)?;
    validate_lore_kind(&input.kind)?;

    let existing = get_lore_note(input.id.clone(), app.clone(), state.clone())
        .await?
        .ok_or_else(|| AppError::NotFound("lore_note".into()))?;

    let pool = state.pool_for_campaign(&app, &existing.campaign_id).await?;
    let now = now_ms();
    let tags_json = serde_json::to_string(&input.tags)?;
    let linked_entities_json = serde_json::to_string(&input.linked_entities)?;
    let next_version = existing.version + 1;

    let updated = sqlx::query(
        r#"
        UPDATE lore_notes
        SET title = ?, kind = ?, body = ?, tags_json = ?, visibility = ?,
            linked_entities_json = ?, updated_at = ?, version = ?
        WHERE id = ?
        "#,
    )
    .bind(title)
    .bind(&input.kind)
    .bind(&input.body)
    .bind(&tags_json)
    .bind(&input.visibility)
    .bind(&linked_entities_json)
    .bind(now)
    .bind(next_version)
    .bind(&input.id)
    .execute(&pool)
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound("lore_note".into()));
    }

    get_lore_note(input.id, app, state)
        .await?
        .ok_or_else(|| AppError::Internal("lore note update succeeded but row missing".into()))
}

#[tauri::command]
pub async fn delete_lore_note(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>) -> Result<(), AppError> {
    let pool = state.pool_for_entity_id(&app, &id).await?;
    let result = sqlx::query("DELETE FROM lore_notes WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("lore_note".into()));
    }
    Ok(())
}
