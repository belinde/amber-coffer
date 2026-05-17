use tauri::State;
use uuid::Uuid;

use crate::db::validate::{ensure_campaign_exists, ensure_entity_in_campaign};
use crate::db::AppState;
use crate::error::AppError;
use crate::validation_issue::{enum_invalid, validation_issues, ValidationIssue};
use crate::models::{
    CreateRelationshipInput, Relationship, RelationshipRow, UpdateRelationshipInput,
};
use crate::util::now_ms;

const VALID_ENTITY_KINDS: &[&str] = &["character", "npc", "location", "faction", "item"];
const VALID_RELATION_TYPES: &[&str] = &[
    "ally", "enemy", "family", "owns", "located_in", "member_of", "knows", "other",
];

#[tauri::command]
pub async fn list_relationships(
    campaign_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<Relationship>, AppError> {
    let rows = sqlx::query_as::<_, RelationshipRow>(
        r#"
        SELECT id, campaign_id, from_kind, from_id, to_kind, to_id, relation_type,
               strength, bidirectional, description, created_at, updated_at, version
        FROM relationships
        WHERE campaign_id = ?
        ORDER BY relation_type COLLATE NOCASE, from_kind, from_id
        "#,
    )
    .bind(&campaign_id)
    .fetch_all(state.pool())
    .await?;

    Ok(rows.into_iter().map(Relationship::from_row).collect())
}

#[tauri::command]
pub async fn get_relationship(
    id: String,
    state: State<'_, AppState>,
) -> Result<Option<Relationship>, AppError> {
    let row = sqlx::query_as::<_, RelationshipRow>(
        r#"
        SELECT id, campaign_id, from_kind, from_id, to_kind, to_id, relation_type,
               strength, bidirectional, description, created_at, updated_at, version
        FROM relationships
        WHERE id = ?
        "#,
    )
    .bind(&id)
    .fetch_optional(state.pool())
    .await?;

    Ok(row.map(Relationship::from_row))
}

#[tauri::command]
pub async fn create_relationship(
    input: CreateRelationshipInput,
    state: State<'_, AppState>,
) -> Result<Relationship, AppError> {
    validate_entity_kind(&input.from_kind)?;
    validate_entity_kind(&input.to_kind)?;
    validate_relation_type(&input.relation_type)?;
    validate_strength(input.strength)?;
    ensure_campaign_exists(state.pool(), &input.campaign_id).await?;
    ensure_entity_in_campaign(state.pool(), &input.campaign_id, &input.from_kind, &input.from_id)
        .await?;
    ensure_entity_in_campaign(state.pool(), &input.campaign_id, &input.to_kind, &input.to_id)
        .await?;

    let id = Uuid::now_v7().to_string();
    let now = now_ms();
    let bidirectional = i32::from(input.bidirectional);

    sqlx::query(
        r#"
        INSERT INTO relationships (
            id, campaign_id, from_kind, from_id, to_kind, to_id, relation_type,
            strength, bidirectional, description, created_at, updated_at, version
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(&id)
    .bind(&input.campaign_id)
    .bind(&input.from_kind)
    .bind(&input.from_id)
    .bind(&input.to_kind)
    .bind(&input.to_id)
    .bind(&input.relation_type)
    .bind(input.strength)
    .bind(bidirectional)
    .bind(&input.description)
    .bind(now)
    .bind(now)
    .execute(state.pool())
    .await?;

    get_relationship(id, state)
        .await?
        .ok_or_else(|| AppError::Internal("relationship insert succeeded but row missing".into()))
}

#[tauri::command]
pub async fn update_relationship(
    input: UpdateRelationshipInput,
    state: State<'_, AppState>,
) -> Result<Relationship, AppError> {
    validate_entity_kind(&input.from_kind)?;
    validate_entity_kind(&input.to_kind)?;
    validate_relation_type(&input.relation_type)?;
    validate_strength(input.strength)?;

    let existing = get_relationship(input.id.clone(), state.clone())
        .await?
        .ok_or_else(|| AppError::NotFound("relationship".into()))?;

    ensure_entity_in_campaign(
        state.pool(),
        &existing.campaign_id,
        &input.from_kind,
        &input.from_id,
    )
    .await?;
    ensure_entity_in_campaign(
        state.pool(),
        &existing.campaign_id,
        &input.to_kind,
        &input.to_id,
    )
    .await?;

    let now = now_ms();
    let bidirectional = i32::from(input.bidirectional);
    let next_version = existing.version + 1;

    let updated = sqlx::query(
        r#"
        UPDATE relationships
        SET from_kind = ?, from_id = ?, to_kind = ?, to_id = ?, relation_type = ?,
            strength = ?, bidirectional = ?, description = ?, updated_at = ?, version = ?
        WHERE id = ?
        "#,
    )
    .bind(&input.from_kind)
    .bind(&input.from_id)
    .bind(&input.to_kind)
    .bind(&input.to_id)
    .bind(&input.relation_type)
    .bind(input.strength)
    .bind(bidirectional)
    .bind(&input.description)
    .bind(now)
    .bind(next_version)
    .bind(&input.id)
    .execute(state.pool())
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound("relationship".into()));
    }

    get_relationship(input.id, state)
        .await?
        .ok_or_else(|| AppError::Internal("relationship update succeeded but row missing".into()))
}

#[tauri::command]
pub async fn delete_relationship(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    let result = sqlx::query("DELETE FROM relationships WHERE id = ?")
        .bind(&id)
        .execute(state.pool())
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("relationship".into()));
    }
    Ok(())
}

fn validate_entity_kind(kind: &str) -> Result<(), AppError> {
    if VALID_ENTITY_KINDS.contains(&kind) {
        Ok(())
    } else {
        Err(enum_invalid(&["fromKind"]))
    }
}

fn validate_relation_type(relation_type: &str) -> Result<(), AppError> {
    if VALID_RELATION_TYPES.contains(&relation_type) {
        Ok(())
    } else {
        Err(enum_invalid(&["relationType"]))
    }
}

fn validate_strength(strength: i32) -> Result<(), AppError> {
    if (-100..=100).contains(&strength) {
        Ok(())
    } else {
        Err(validation_issues(vec![ValidationIssue::new(
            &["strength"],
            "generic.invalid",
        )]))
    }
}
