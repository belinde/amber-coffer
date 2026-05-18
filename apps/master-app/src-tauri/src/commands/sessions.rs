use std::sync::Arc;

use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::commands::vault_validate::{validate_session_play_state, validate_session_status};
use crate::db::validate::ensure_campaign_exists;
use crate::db::{AppState, RecordingState};
use crate::error::AppError;
use crate::models::{CreateSessionInput, Session, UpdateSessionInput};
use crate::services::discord_recording::{load_session, stop_recording};
use crate::util::now_ms;
use crate::validation_issue::{enum_invalid, required_field};

const SESSION_SELECT: &str = r#"
        SELECT id, campaign_id, number, title, play_state, status, started_at, ended_at,
               summary, events_body, gm_notes, public_summary,
               locations_visited_json, npcs_encountered_json, played_at,
               created_at, updated_at, version
        FROM sessions
"#;

#[tauri::command]
pub async fn list_sessions(
    campaign_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<Session>, AppError> {
    let pool = state.pool_for_campaign(&app, &campaign_id).await?;
    let query = format!("{SESSION_SELECT} WHERE campaign_id = ? ORDER BY number DESC");
    let rows = sqlx::query_as::<_, Session>(&query)
        .bind(&campaign_id)
        .fetch_all(&pool)
        .await?;

    Ok(rows)
}

#[tauri::command]
pub async fn get_session(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<Session>, AppError> {
    let pool = state.pool_for_entity_id(&app, &id).await?;
    let query = format!("{SESSION_SELECT} WHERE id = ?");
    let row = sqlx::query_as::<_, Session>(&query)
        .bind(&id)
        .fetch_optional(&pool)
        .await?;

    Ok(row)
}

#[tauri::command]
pub async fn create_session(
    input: CreateSessionInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Session, AppError> {
    ensure_campaign_exists(&app, &input.campaign_id).await?;
    let pool = state.pool_for_campaign(&app, &input.campaign_id).await?;

    let status = input.status.as_deref().unwrap_or("planned");
    validate_session_status(status)?;

    let number = match input.number {
        Some(n) if n > 0 => {
            ensure_session_number_available(&pool, &input.campaign_id, n, None).await?;
            n
        }
        _ => next_session_number(&pool, &input.campaign_id).await?,
    };

    let id = Uuid::now_v7().to_string();
    let now = now_ms();

    let summary = input.summary.as_deref().unwrap_or("");
    let events_body = input.events_body.as_deref().unwrap_or("");
    let gm_notes = input.gm_notes.as_deref().unwrap_or("");
    let locations_visited_json = input
        .locations_visited_json
        .as_deref()
        .unwrap_or("[]");
    let npcs_encountered_json = input
        .npcs_encountered_json
        .as_deref()
        .unwrap_or("[]");

    sqlx::query(
        r#"
        INSERT INTO sessions (
            id, campaign_id, number, title, play_state, status, started_at, ended_at,
            summary, events_body, gm_notes, public_summary,
            locations_visited_json, npcs_encountered_json, played_at,
            created_at, updated_at, version
        )
        VALUES (?, ?, ?, ?, 'preparing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(&id)
    .bind(&input.campaign_id)
    .bind(number)
    .bind(&input.title)
    .bind(status)
    .bind(input.started_at)
    .bind(input.ended_at)
    .bind(summary)
    .bind(events_body)
    .bind(gm_notes)
    .bind(&input.public_summary)
    .bind(locations_visited_json)
    .bind(npcs_encountered_json)
    .bind(input.played_at)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await?;

    get_session(id, app, state)
        .await?
        .ok_or_else(|| AppError::Internal("session insert succeeded but row missing".into()))
}

#[tauri::command]
pub async fn update_session(
    input: UpdateSessionInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Session, AppError> {
    if input.number <= 0 {
        return Err(required_field(&["number"]));
    }
    validate_session_status(&input.status)?;

    let existing = get_session(input.id.clone(), app.clone(), state.clone())
        .await?
        .ok_or_else(|| AppError::NotFound("session".into()))?;
    let pool = state.pool_for_campaign(&app, &existing.campaign_id).await?;

    ensure_session_number_available(
        &pool,
        &existing.campaign_id,
        input.number,
        Some(&input.id),
    )
    .await?;

    let now = now_ms();

    let summary = input
        .summary
        .as_deref()
        .unwrap_or(existing.summary.as_str());
    let events_body = input
        .events_body
        .as_deref()
        .unwrap_or(existing.events_body.as_str());
    let gm_notes = input
        .gm_notes
        .as_deref()
        .unwrap_or(existing.gm_notes.as_str());
    let public_summary = input
        .public_summary
        .as_ref()
        .or(existing.public_summary.as_ref());
    let locations_visited_json = input
        .locations_visited_json
        .as_deref()
        .unwrap_or(existing.locations_visited_json.as_str());
    let npcs_encountered_json = input
        .npcs_encountered_json
        .as_deref()
        .unwrap_or(existing.npcs_encountered_json.as_str());
    let played_at = input.played_at.or(existing.played_at);

    let updated = sqlx::query(
        r#"
        UPDATE sessions
        SET number = ?, title = ?, status = ?, started_at = ?, ended_at = ?,
            summary = ?, events_body = ?, gm_notes = ?, public_summary = ?,
            locations_visited_json = ?, npcs_encountered_json = ?, played_at = ?,
            updated_at = ?, version = version + 1
        WHERE id = ?
        "#,
    )
    .bind(input.number)
    .bind(&input.title)
    .bind(&input.status)
    .bind(input.started_at)
    .bind(input.ended_at)
    .bind(summary)
    .bind(events_body)
    .bind(gm_notes)
    .bind(public_summary)
    .bind(locations_visited_json)
    .bind(npcs_encountered_json)
    .bind(played_at)
    .bind(now)
    .bind(&input.id)
    .execute(&pool)
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound("session".into()));
    }

    get_session(input.id, app, state)
        .await?
        .ok_or_else(|| AppError::Internal("session update succeeded but row missing".into()))
}

#[tauri::command]
pub async fn session_begin_play(
    session_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Session, AppError> {
    let pool = state.pool_for_entity_id(&app, &session_id).await?;
    let session = load_session(&pool, &session_id).await?;
    validate_session_play_state(&session.play_state)?;

    if session.play_state != "preparing" {
        return Err(enum_invalid(&["playState"]));
    }

    let other_live: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM sessions WHERE campaign_id = ? AND play_state = 'live' AND id != ?",
    )
    .bind(&session.campaign_id)
    .bind(&session_id)
    .fetch_optional(&pool)
    .await?;

    if other_live.is_some() {
        return Err(AppError::Internal(
            "another session is already live for this campaign".into(),
        ));
    }

    let now = now_ms();
    let started_at = session.started_at.unwrap_or(now);

    sqlx::query(
        r#"
        UPDATE sessions
        SET play_state = 'live', started_at = ?, updated_at = ?, version = version + 1
        WHERE id = ?
        "#,
    )
    .bind(started_at)
    .bind(now)
    .bind(&session_id)
    .execute(&pool)
    .await?;

    get_session(session_id, app, state)
        .await?
        .ok_or_else(|| AppError::Internal("session begin play succeeded but row missing".into()))
}

#[tauri::command]
pub async fn session_end_play(
    app: AppHandle,
    session_id: String,
    state: State<'_, AppState>,
    recording_state: State<'_, Arc<RecordingState>>,
) -> Result<Session, AppError> {
    let pool = state.pool_for_entity_id(&app, &session_id).await?;
    let session = load_session(&pool, &session_id).await?;

    if session.play_state != "live" {
        return Err(enum_invalid(&["playState"]));
    }

    let recording_active = recording_state
        .0
        .lock()
        .map_err(|_| AppError::Internal("recording state lock poisoned".into()))?
        .as_ref()
        .is_some_and(|r| r.session_id == session_id);

    if recording_active {
        stop_recording(
            &app,
            &pool,
            &session_id,
            recording_state.inner(),
        )
        .await?;
    }

    let now = now_ms();

    sqlx::query(
        r#"
        UPDATE sessions
        SET play_state = 'ended', ended_at = ?, updated_at = ?, version = version + 1
        WHERE id = ?
        "#,
    )
    .bind(now)
    .bind(now)
    .bind(&session_id)
    .execute(&pool)
    .await?;

    get_session(session_id, app, state)
        .await?
        .ok_or_else(|| AppError::Internal("session end play succeeded but row missing".into()))
}

#[tauri::command]
pub async fn delete_session(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let pool = state.pool_for_entity_id(&app, &id).await?;
    let session = get_session(id.clone(), app.clone(), state.clone())
        .await?
        .ok_or_else(|| AppError::NotFound("session".into()))?;

    if session.play_state == "live" {
        return Err(AppError::Internal(
            "cannot delete a session while it is live".into(),
        ));
    }

    let result = sqlx::query("DELETE FROM sessions WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("session".into()));
    }

    Ok(())
}

async fn next_session_number(pool: &sqlx::SqlitePool, campaign_id: &str) -> Result<i32, AppError> {
    let max_number: Option<i32> =
        sqlx::query_scalar("SELECT MAX(number) FROM sessions WHERE campaign_id = ?")
            .bind(campaign_id)
            .fetch_one(pool)
            .await?;

    Ok(max_number.unwrap_or(0) + 1)
}

async fn ensure_session_number_available(
    pool: &sqlx::SqlitePool,
    campaign_id: &str,
    number: i32,
    exclude_id: Option<&str>,
) -> Result<(), AppError> {
    let exists: Option<i64> = if let Some(id) = exclude_id {
        sqlx::query_scalar(
            "SELECT 1 FROM sessions WHERE campaign_id = ? AND number = ? AND id != ?",
        )
        .bind(campaign_id)
        .bind(number)
        .bind(id)
        .fetch_optional(pool)
        .await?
    } else {
        sqlx::query_scalar("SELECT 1 FROM sessions WHERE campaign_id = ? AND number = ?")
            .bind(campaign_id)
            .bind(number)
            .fetch_optional(pool)
            .await?
    };

    if exists.is_some() {
        Err(enum_invalid(&["number"]))
    } else {
        Ok(())
    }
}
