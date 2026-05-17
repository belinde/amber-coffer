use tauri::State;
use uuid::Uuid;

use crate::commands::vault_validate::validate_seed_status;
use crate::db::validate::ensure_campaign_exists;
use crate::db::AppState;
use crate::error::AppError;
use crate::validation_issue::required_field;
use crate::models::{
    CreateNarrativeSeedInput, NarrativeSeed, NarrativeSeedRow, UpdateNarrativeSeedInput,
};
use crate::util::now_ms;

const NARRATIVE_SEED_SELECT: &str = r#"
        SELECT id, campaign_id, title, summary, status, body, tags_json,
               linked_entities_json, first_session_id, created_at, updated_at, version
        FROM narrative_seeds
"#;

#[tauri::command]
pub async fn list_narrative_seeds(
    campaign_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<NarrativeSeed>, AppError> {
    let query = format!(
        "{NARRATIVE_SEED_SELECT} WHERE campaign_id = ? ORDER BY title COLLATE NOCASE"
    );
    let rows = sqlx::query_as::<_, NarrativeSeedRow>(&query)
        .bind(&campaign_id)
        .fetch_all(state.pool())
        .await?;

    Ok(rows.into_iter().map(NarrativeSeed::from_row).collect())
}

#[tauri::command]
pub async fn get_narrative_seed(
    id: String,
    state: State<'_, AppState>,
) -> Result<Option<NarrativeSeed>, AppError> {
    let query = format!("{NARRATIVE_SEED_SELECT} WHERE id = ?");
    let row = sqlx::query_as::<_, NarrativeSeedRow>(&query)
        .bind(&id)
        .fetch_optional(state.pool())
        .await?;

    Ok(row.map(NarrativeSeed::from_row))
}

#[tauri::command]
pub async fn create_narrative_seed(
    input: CreateNarrativeSeedInput,
    state: State<'_, AppState>,
) -> Result<NarrativeSeed, AppError> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(required_field(&["title"]));
    }
    validate_seed_status(&input.status)?;
    ensure_campaign_exists(state.pool(), &input.campaign_id).await?;

    let id = Uuid::now_v7().to_string();
    let now = now_ms();
    let tags_json = serde_json::to_string(&input.tags)?;
    let linked_entities_json = serde_json::to_string(&input.linked_entities)?;

    sqlx::query(
        r#"
        INSERT INTO narrative_seeds (
            id, campaign_id, title, summary, status, body, tags_json,
            linked_entities_json, first_session_id, created_at, updated_at, version
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(&id)
    .bind(&input.campaign_id)
    .bind(title)
    .bind(&input.summary)
    .bind(&input.status)
    .bind(&input.body)
    .bind(&tags_json)
    .bind(&linked_entities_json)
    .bind(&input.first_session_id)
    .bind(now)
    .bind(now)
    .execute(state.pool())
    .await?;

    get_narrative_seed(id, state).await?.ok_or_else(|| {
        AppError::Internal("narrative seed insert succeeded but row missing".into())
    })
}

#[tauri::command]
pub async fn update_narrative_seed(
    input: UpdateNarrativeSeedInput,
    state: State<'_, AppState>,
) -> Result<NarrativeSeed, AppError> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(required_field(&["title"]));
    }
    validate_seed_status(&input.status)?;

    let existing = get_narrative_seed(input.id.clone(), state.clone())
        .await?
        .ok_or_else(|| AppError::NotFound("narrative_seed".into()))?;

    let now = now_ms();
    let tags_json = serde_json::to_string(&input.tags)?;
    let linked_entities_json = serde_json::to_string(&input.linked_entities)?;
    let next_version = existing.version + 1;

    let updated = sqlx::query(
        r#"
        UPDATE narrative_seeds
        SET title = ?, summary = ?, status = ?, body = ?, tags_json = ?,
            linked_entities_json = ?, first_session_id = ?, updated_at = ?, version = ?
        WHERE id = ?
        "#,
    )
    .bind(title)
    .bind(&input.summary)
    .bind(&input.status)
    .bind(&input.body)
    .bind(&tags_json)
    .bind(&linked_entities_json)
    .bind(&input.first_session_id)
    .bind(now)
    .bind(next_version)
    .bind(&input.id)
    .execute(state.pool())
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound("narrative_seed".into()));
    }

    get_narrative_seed(input.id, state).await?.ok_or_else(|| {
        AppError::Internal("narrative seed update succeeded but row missing".into())
    })
}

#[tauri::command]
pub async fn delete_narrative_seed(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    let result = sqlx::query("DELETE FROM narrative_seeds WHERE id = ?")
        .bind(&id)
        .execute(state.pool())
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("narrative_seed".into()));
    }
    Ok(())
}
