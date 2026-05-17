use tauri::State;
use uuid::Uuid;

use crate::commands::vault_validate::{validate_npc_record_kind, validate_visibility};
use crate::db::validate::{
    ensure_campaign_exists, ensure_faction_in_campaign, ensure_location_in_campaign,
    validate_events_interesting,
};
use crate::db::AppState;
use crate::error::AppError;
use crate::validation_issue::{enum_invalid, required_field};
use crate::models::{CreateNpcInput, Npc, NpcRow, UpdateNpcInput};
use crate::util::now_ms;

const VALID_STATUSES: &[&str] = &["alive", "dead", "missing", "unknown"];
const VALID_DISPOSITIONS: &[&str] = &["friendly", "neutral", "hostile", "unknown"];

const NPC_SELECT: &str = r#"
        SELECT id, campaign_id, name, current_location_id, faction_id,
               species, role_hint, region, scope, reminder, record_kind,
               game_system_hint, gm_notes, visibility, appearance_json, game_stats_json,
               notable_equipment_json, links_to_characters_json, events_interesting_json,
               image_ref_json, status, disposition, description,
               created_at, updated_at, version
        FROM npcs
"#;

#[tauri::command]
pub async fn list_npcs(campaign_id: String, state: State<'_, AppState>) -> Result<Vec<Npc>, AppError> {
    let query = format!("{NPC_SELECT} WHERE campaign_id = ? ORDER BY name COLLATE NOCASE");
    let rows = sqlx::query_as::<_, NpcRow>(&query)
        .bind(&campaign_id)
        .fetch_all(state.pool())
        .await?;

    Ok(rows.into_iter().map(Npc::from_row).collect())
}

#[tauri::command]
pub async fn get_npc(id: String, state: State<'_, AppState>) -> Result<Option<Npc>, AppError> {
    let query = format!("{NPC_SELECT} WHERE id = ?");
    let row = sqlx::query_as::<_, NpcRow>(&query)
        .bind(&id)
        .fetch_optional(state.pool())
        .await?;

    Ok(row.map(Npc::from_row))
}

#[tauri::command]
pub async fn create_npc(input: CreateNpcInput, state: State<'_, AppState>) -> Result<Npc, AppError> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(required_field(&["name"]));
    }
    validate_status(&input.status)?;
    validate_disposition(input.disposition.as_deref())?;
    validate_visibility(&input.visibility)?;
    validate_npc_record_kind(&input.record_kind)?;
    ensure_campaign_exists(state.pool(), &input.campaign_id).await?;
    if let Some(ref loc) = input.current_location_id {
        ensure_location_in_campaign(state.pool(), loc, &input.campaign_id).await?;
    }
    if let Some(ref faction) = input.faction_id {
        ensure_faction_in_campaign(state.pool(), faction, &input.campaign_id).await?;
    }
    validate_events_interesting(state.pool(), &input.campaign_id, &input.events_interesting).await?;

    let id = Uuid::now_v7().to_string();
    let now = now_ms();
    let json = serialize_npc_json_fields(&input.appearance, &input.game_stats, &input.notable_equipment, &input.links_to_characters, &input.events_interesting, input.image.as_ref())?;

    sqlx::query(
        r#"
        INSERT INTO npcs (
            id, campaign_id, name, current_location_id, faction_id,
            species, role_hint, region, scope, reminder, record_kind,
            game_system_hint, gm_notes, visibility, appearance_json, game_stats_json,
            notable_equipment_json, links_to_characters_json, events_interesting_json,
            image_ref_json, attributes_json, status, disposition, description,
            created_at, updated_at, version
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(&id)
    .bind(&input.campaign_id)
    .bind(name)
    .bind(&input.current_location_id)
    .bind(&input.faction_id)
    .bind(&input.species)
    .bind(&input.role_hint)
    .bind(&input.region)
    .bind(&input.scope)
    .bind(&input.reminder)
    .bind(&input.record_kind)
    .bind(&input.game_system_hint)
    .bind(&input.gm_notes)
    .bind(&input.visibility)
    .bind(&json.appearance_json)
    .bind(&json.game_stats_json)
    .bind(&json.notable_equipment_json)
    .bind(&json.links_to_characters_json)
    .bind(&json.events_interesting_json)
    .bind(&json.image_ref_json)
    .bind(&json.game_stats_json)
    .bind(&input.status)
    .bind(&input.disposition)
    .bind(&input.description)
    .bind(now)
    .bind(now)
    .execute(state.pool())
    .await?;

    get_npc(id, state)
        .await?
        .ok_or_else(|| AppError::Internal("npc insert succeeded but row missing".into()))
}

#[tauri::command]
pub async fn update_npc(input: UpdateNpcInput, state: State<'_, AppState>) -> Result<Npc, AppError> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(required_field(&["name"]));
    }
    validate_status(&input.status)?;
    validate_disposition(input.disposition.as_deref())?;
    validate_visibility(&input.visibility)?;
    validate_npc_record_kind(&input.record_kind)?;

    let existing = get_npc(input.id.clone(), state.clone())
        .await?
        .ok_or_else(|| AppError::NotFound("npc".into()))?;

    if let Some(ref loc) = input.current_location_id {
        ensure_location_in_campaign(state.pool(), loc, &existing.campaign_id).await?;
    }
    if let Some(ref faction) = input.faction_id {
        ensure_faction_in_campaign(state.pool(), faction, &existing.campaign_id).await?;
    }
    validate_events_interesting(state.pool(), &existing.campaign_id, &input.events_interesting).await?;

    let now = now_ms();
    let json = serialize_npc_json_fields(&input.appearance, &input.game_stats, &input.notable_equipment, &input.links_to_characters, &input.events_interesting, input.image.as_ref())?;
    let next_version = existing.version + 1;

    let updated = sqlx::query(
        r#"
        UPDATE npcs
        SET name = ?, current_location_id = ?, faction_id = ?,
            species = ?, role_hint = ?, region = ?, scope = ?, reminder = ?, record_kind = ?,
            game_system_hint = ?, gm_notes = ?, visibility = ?,
            appearance_json = ?, game_stats_json = ?, notable_equipment_json = ?,
            links_to_characters_json = ?, events_interesting_json = ?, image_ref_json = ?,
            attributes_json = ?, status = ?, disposition = ?, description = ?,
            updated_at = ?, version = ?
        WHERE id = ?
        "#,
    )
    .bind(name)
    .bind(&input.current_location_id)
    .bind(&input.faction_id)
    .bind(&input.species)
    .bind(&input.role_hint)
    .bind(&input.region)
    .bind(&input.scope)
    .bind(&input.reminder)
    .bind(&input.record_kind)
    .bind(&input.game_system_hint)
    .bind(&input.gm_notes)
    .bind(&input.visibility)
    .bind(&json.appearance_json)
    .bind(&json.game_stats_json)
    .bind(&json.notable_equipment_json)
    .bind(&json.links_to_characters_json)
    .bind(&json.events_interesting_json)
    .bind(&json.image_ref_json)
    .bind(&json.game_stats_json)
    .bind(&input.status)
    .bind(&input.disposition)
    .bind(&input.description)
    .bind(now)
    .bind(next_version)
    .bind(&input.id)
    .execute(state.pool())
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound("npc".into()));
    }

    get_npc(input.id, state)
        .await?
        .ok_or_else(|| AppError::Internal("npc update succeeded but row missing".into()))
}

#[tauri::command]
pub async fn delete_npc(id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    let result = sqlx::query("DELETE FROM npcs WHERE id = ?")
        .bind(&id)
        .execute(state.pool())
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("npc".into()));
    }
    Ok(())
}

struct NpcJsonFields {
    appearance_json: String,
    game_stats_json: String,
    notable_equipment_json: String,
    links_to_characters_json: String,
    events_interesting_json: String,
    image_ref_json: Option<String>,
}

fn serialize_npc_json_fields(
    appearance: &crate::models::vault_json::Appearance,
    game_stats: &serde_json::Value,
    notable_equipment: &[String],
    links_to_characters: &[crate::models::vault_json::LinkToCharacter],
    events_interesting: &[crate::models::vault_json::EventReference],
    image: Option<&crate::models::vault_json::ImageRef>,
) -> Result<NpcJsonFields, AppError> {
    Ok(NpcJsonFields {
        appearance_json: serde_json::to_string(appearance)?,
        game_stats_json: serde_json::to_string(game_stats)?,
        notable_equipment_json: serde_json::to_string(notable_equipment)?,
        links_to_characters_json: serde_json::to_string(links_to_characters)?,
        events_interesting_json: serde_json::to_string(events_interesting)?,
        image_ref_json: image.map(serde_json::to_string).transpose()?,
    })
}

fn validate_status(status: &str) -> Result<(), AppError> {
    if VALID_STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(enum_invalid(&["status"]))
    }
}

fn validate_disposition(disposition: Option<&str>) -> Result<(), AppError> {
    match disposition {
        None => Ok(()),
        Some(d) if VALID_DISPOSITIONS.contains(&d) => Ok(()),
        Some(_) => Err(enum_invalid(&["disposition"])),
    }
}
