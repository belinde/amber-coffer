use tauri::State;
use uuid::Uuid;

use crate::db::validate::{ensure_campaign_exists, ensure_item_owner};
use crate::db::AppState;
use crate::error::AppError;
use crate::validation_issue::{enum_invalid, required_field};
use crate::models::{CreateItemInput, Item, UpdateItemInput};
use crate::util::now_ms;

const VALID_KINDS: &[&str] = &["weapon", "armor", "consumable", "key", "artifact", "misc"];
const VALID_RARITIES: &[&str] = &["common", "uncommon", "rare", "legendary", "unique"];
const VALID_OWNER_KINDS: &[&str] = &["character", "npc", "location", "faction"];

#[tauri::command]
pub async fn list_items(campaign_id: String, state: State<'_, AppState>) -> Result<Vec<Item>, AppError> {
    sqlx::query_as::<_, Item>(
        r#"
        SELECT id, campaign_id, name, kind, rarity, description, owner_kind, owner_id,
               created_at, updated_at, version
        FROM items
        WHERE campaign_id = ?
        ORDER BY name COLLATE NOCASE
        "#,
    )
    .bind(&campaign_id)
    .fetch_all(state.pool())
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub async fn get_item(id: String, state: State<'_, AppState>) -> Result<Option<Item>, AppError> {
    sqlx::query_as::<_, Item>(
        r#"
        SELECT id, campaign_id, name, kind, rarity, description, owner_kind, owner_id,
               created_at, updated_at, version
        FROM items
        WHERE id = ?
        "#,
    )
    .bind(&id)
    .fetch_optional(state.pool())
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub async fn create_item(input: CreateItemInput, state: State<'_, AppState>) -> Result<Item, AppError> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(required_field(&["name"]));
    }
    validate_kind(input.kind.as_deref())?;
    validate_rarity(input.rarity.as_deref())?;
    validate_owner_kind(input.owner_kind.as_deref())?;
    ensure_campaign_exists(state.pool(), &input.campaign_id).await?;
    ensure_item_owner(
        state.pool(),
        &input.campaign_id,
        input.owner_kind.as_deref(),
        input.owner_id.as_deref(),
    )
    .await?;

    let id = Uuid::now_v7().to_string();
    let now = now_ms();

    sqlx::query(
        r#"
        INSERT INTO items (
            id, campaign_id, name, kind, rarity, description, owner_kind, owner_id,
            created_at, updated_at, version
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(&id)
    .bind(&input.campaign_id)
    .bind(name)
    .bind(&input.kind)
    .bind(&input.rarity)
    .bind(&input.description)
    .bind(&input.owner_kind)
    .bind(&input.owner_id)
    .bind(now)
    .bind(now)
    .execute(state.pool())
    .await?;

    get_item(id, state)
        .await?
        .ok_or_else(|| AppError::Internal("item insert succeeded but row missing".into()))
}

#[tauri::command]
pub async fn update_item(input: UpdateItemInput, state: State<'_, AppState>) -> Result<Item, AppError> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(required_field(&["name"]));
    }
    validate_kind(input.kind.as_deref())?;
    validate_rarity(input.rarity.as_deref())?;
    validate_owner_kind(input.owner_kind.as_deref())?;

    let existing = get_item(input.id.clone(), state.clone())
        .await?
        .ok_or_else(|| AppError::NotFound("item".into()))?;

    ensure_item_owner(
        state.pool(),
        &existing.campaign_id,
        input.owner_kind.as_deref(),
        input.owner_id.as_deref(),
    )
    .await?;

    let now = now_ms();
    let next_version = existing.version + 1;

    let updated = sqlx::query(
        r#"
        UPDATE items
        SET name = ?, kind = ?, rarity = ?, description = ?, owner_kind = ?, owner_id = ?,
            updated_at = ?, version = ?
        WHERE id = ?
        "#,
    )
    .bind(name)
    .bind(&input.kind)
    .bind(&input.rarity)
    .bind(&input.description)
    .bind(&input.owner_kind)
    .bind(&input.owner_id)
    .bind(now)
    .bind(next_version)
    .bind(&input.id)
    .execute(state.pool())
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound("item".into()));
    }

    get_item(input.id, state)
        .await?
        .ok_or_else(|| AppError::Internal("item update succeeded but row missing".into()))
}

#[tauri::command]
pub async fn delete_item(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    let result = sqlx::query("DELETE FROM items WHERE id = ?")
        .bind(&id)
        .execute(state.pool())
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("item".into()));
    }
    Ok(())
}

fn validate_kind(kind: Option<&str>) -> Result<(), AppError> {
    match kind {
        None => Ok(()),
        Some(k) if VALID_KINDS.contains(&k) => Ok(()),
        Some(_) => Err(enum_invalid(&["kind"])),
    }
}

fn validate_rarity(rarity: Option<&str>) -> Result<(), AppError> {
    match rarity {
        None => Ok(()),
        Some(r) if VALID_RARITIES.contains(&r) => Ok(()),
        Some(_) => Err(enum_invalid(&["rarity"])),
    }
}

fn validate_owner_kind(kind: Option<&str>) -> Result<(), AppError> {
    match kind {
        None => Ok(()),
        Some(k) if VALID_OWNER_KINDS.contains(&k) => Ok(()),
        Some(_) => Err(enum_invalid(&["ownerKind"])),
    }
}
