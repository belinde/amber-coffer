use std::collections::HashMap;
use std::fs;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::commands::campaigns::{
    find_or_create_campaign_by_name, POC_CAMPAIGN_DESCRIPTION, POC_CAMPAIGN_NAME,
};
use crate::db::validate::ensure_campaign_exists;
use crate::db::AppState;
use crate::error::AppError;
use crate::models::import_dump::{
    CampaignImportDump, ImportCampaignImage, ImportCharacter, ImportDumpAsset, ImportFaction,
    ImportLocation, ImportLoreNote, ImportNarrativeSeed, ImportNpc, ImportSession,
};
use crate::models::vault_json::ImageRef;
use crate::services::import_images::copy_image_to_l1;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCampaignReport {
    pub campaign_id: String,
    pub campaign_created: bool,
    pub imported: usize,
    pub updated: usize,
    pub skipped: usize,
    pub images_copied: usize,
    pub errors: Vec<String>,
}

#[tauri::command]
pub async fn import_campaign_dump(
    dump_path: String,
    campaign_id: Option<String>,
    campaign_name: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ImportCampaignReport, AppError> {
    let raw = fs::read_to_string(&dump_path)
        .map_err(|e| AppError::Internal(format!("read dump: {e}")))?;
    let dump: CampaignImportDump = serde_json::from_str(&raw)?;

    if dump.version != 1 {
        return Err(AppError::Internal(format!(
            "unsupported dump version {}",
            dump.version
        )));
    }

    let (resolved_id, campaign_created) = match campaign_id {
        Some(id) => {
            ensure_campaign_exists(&app, &id).await?;
            (id, false)
        }
        None => {
            let name = campaign_name
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or(POC_CAMPAIGN_NAME);
            let catchphrase = if name == POC_CAMPAIGN_NAME {
                Some(POC_CAMPAIGN_DESCRIPTION.to_string())
            } else {
                None
            };
            let (campaign, created) = find_or_create_campaign_by_name(
                name,
                None,
                catchphrase,
                Some(&dump.campaign_id),
                &app,
                &state,
            )
            .await?;
            (campaign.id, created)
        }
    };

    if dump.campaign_id != resolved_id {
        return Err(AppError::Internal(format!(
            "dump campaignId ({}) does not match target campaign ({}); re-run extract with --campaign-id {}",
            dump.campaign_id, resolved_id, resolved_id
        )));
    }

    let pool = state.pool_for_campaign(&app, &resolved_id).await?;

    let mut report = ImportCampaignReport {
        campaign_id: resolved_id.clone(),
        campaign_created,
        imported: 0,
        updated: 0,
        skipped: 0,
        images_copied: 0,
        errors: vec![],
    };

    let mut tx = pool.begin().await?;

    for loc in &dump.entities.locations {
        upsert_location(&mut tx, loc).await?;
        report.imported += 1;
    }
    for fac in &dump.entities.factions {
        upsert_faction(&mut tx, fac).await?;
        report.imported += 1;
    }
    for ch in &dump.entities.characters {
        upsert_character(&mut tx, ch).await?;
        report.imported += 1;
    }
    for npc in &dump.entities.npcs {
        upsert_npc(&mut tx, npc).await?;
        report.imported += 1;
    }
    for note in &dump.entities.lore_notes {
        upsert_lore_note(&mut tx, note).await?;
        report.imported += 1;
    }
    for seed in &dump.entities.narrative_seeds {
        upsert_narrative_seed(&mut tx, seed).await?;
        report.imported += 1;
    }
    for session in &dump.entities.sessions {
        upsert_session(&mut tx, session).await?;
        report.imported += 1;
    }
    for image in &dump.entities.campaign_images {
        upsert_campaign_image(&mut tx, image).await?;
        report.imported += 1;
    }

    tx.commit().await?;

    let image_refs = apply_assets(&app, &resolved_id, &dump.assets, &mut report);

    let mut tx = pool.begin().await?;
    for (entity_id, image_ref) in image_refs {
        if let Some(err) = update_entity_image_ref(&mut tx, &dump.assets, &entity_id, &image_ref).await
        {
            report.errors.push(err);
        }
    }
    tx.commit().await?;

    Ok(report)
}

fn apply_assets(
    app: &AppHandle,
    campaign_id: &str,
    assets: &[ImportDumpAsset],
    report: &mut ImportCampaignReport,
) -> HashMap<String, ImageRef> {
    let mut refs = HashMap::new();
    for asset in assets {
        match copy_image_to_l1(app, campaign_id, &asset.entity_id, &asset.source_path) {
            Ok(image_ref) => {
                refs.insert(asset.entity_id.clone(), image_ref);
                report.images_copied += 1;
            }
            Err(e) => {
                report.errors.push(format!(
                    "asset {} ({}): {e}",
                    asset.entity_id, asset.source_path
                ));
            }
        }
    }
    refs
}

async fn update_entity_image_ref(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    assets: &[ImportDumpAsset],
    entity_id: &str,
    image_ref: &ImageRef,
) -> Option<String> {
    let kind = assets
        .iter()
        .find(|a| a.entity_id == entity_id)
        .map(|a| a.entity_kind.as_str())?;
    let json = match serde_json::to_string(image_ref) {
        Ok(j) => j,
        Err(e) => return Some(format!("serialize image ref: {e}")),
    };

    let result = match kind {
        "character" => {
            sqlx::query("UPDATE characters SET image_ref_json = ?, updated_at = ? WHERE id = ?")
                .bind(&json)
                .bind(chrono_now())
                .bind(entity_id)
                .execute(&mut **tx)
                .await
        }
        "npc" => {
            sqlx::query("UPDATE npcs SET image_ref_json = ?, updated_at = ? WHERE id = ?")
                .bind(&json)
                .bind(chrono_now())
                .bind(entity_id)
                .execute(&mut **tx)
                .await
        }
        "location" => {
            sqlx::query("UPDATE locations SET image_ref_json = ?, updated_at = ? WHERE id = ?")
                .bind(&json)
                .bind(chrono_now())
                .bind(entity_id)
                .execute(&mut **tx)
                .await
        }
        "faction" => {
            sqlx::query("UPDATE factions SET image_ref_json = ?, updated_at = ? WHERE id = ?")
                .bind(&json)
                .bind(chrono_now())
                .bind(entity_id)
                .execute(&mut **tx)
                .await
        }
        "campaign_image" => {
            sqlx::query(
                "UPDATE campaign_images SET image_ref_json = ?, updated_at = ? WHERE id = ?",
            )
            .bind(&json)
            .bind(chrono_now())
            .bind(entity_id)
            .execute(&mut **tx)
            .await
        }
        _ => return Some(format!("unknown asset entity kind: {kind}")),
    };

    if let Err(e) = result {
        return Some(format!("update image ref for {entity_id}: {e}"));
    }
    None
}

fn chrono_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

async fn upsert_location(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    loc: &ImportLocation,
) -> Result<(), AppError> {
    let appearance_json = serde_json::to_string(&loc.appearance)?;
    let sections_json = serde_json::to_string(&loc.sections)?;
    let events_json = serde_json::to_string(&loc.events_interesting)?;
    let image_ref_json = loc.image.as_ref().map(serde_json::to_string).transpose()?;
    let coordinates_json = loc
        .coordinates
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;

    sqlx::query(
        r#"
        INSERT INTO locations (
            id, campaign_id, parent_id, name, kind, description, coordinates_json,
            region, population, visibility, appearance_json, sections_json,
            events_interesting_json, image_ref_json, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            campaign_id = excluded.campaign_id,
            parent_id = excluded.parent_id,
            name = excluded.name,
            kind = excluded.kind,
            description = excluded.description,
            coordinates_json = excluded.coordinates_json,
            region = excluded.region,
            population = excluded.population,
            visibility = excluded.visibility,
            appearance_json = excluded.appearance_json,
            sections_json = excluded.sections_json,
            events_interesting_json = excluded.events_interesting_json,
            image_ref_json = COALESCE(excluded.image_ref_json, locations.image_ref_json),
            updated_at = excluded.updated_at,
            version = excluded.version
        "#,
    )
    .bind(&loc.id)
    .bind(&loc.campaign_id)
    .bind(&loc.parent_id)
    .bind(&loc.name)
    .bind(&loc.kind)
    .bind(&loc.description)
    .bind(coordinates_json)
    .bind(&loc.region)
    .bind(&loc.population)
    .bind(&loc.visibility)
    .bind(&appearance_json)
    .bind(&sections_json)
    .bind(&events_json)
    .bind(&image_ref_json)
    .bind(loc.created_at)
    .bind(loc.updated_at)
    .bind(loc.version)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn upsert_faction(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    fac: &ImportFaction,
) -> Result<(), AppError> {
    let events_json = serde_json::to_string(&fac.events_interesting)?;
    let image_ref_json = fac.image.as_ref().map(serde_json::to_string).transpose()?;

    sqlx::query(
        r#"
        INSERT INTO factions (
            id, campaign_id, name, alignment, description, headquarters_location_id,
            faction_kind, parent_faction_id, goals, secrets, visibility,
            events_interesting_json, image_ref_json, created_at, updated_at, version
        ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            campaign_id = excluded.campaign_id,
            name = excluded.name,
            description = excluded.description,
            headquarters_location_id = excluded.headquarters_location_id,
            faction_kind = excluded.faction_kind,
            parent_faction_id = excluded.parent_faction_id,
            goals = excluded.goals,
            secrets = excluded.secrets,
            visibility = excluded.visibility,
            events_interesting_json = excluded.events_interesting_json,
            image_ref_json = COALESCE(excluded.image_ref_json, factions.image_ref_json),
            updated_at = excluded.updated_at,
            version = excluded.version
        "#,
    )
    .bind(&fac.id)
    .bind(&fac.campaign_id)
    .bind(&fac.name)
    .bind(&fac.description)
    .bind(&fac.headquarters_location_id)
    .bind(&fac.kind)
    .bind(&fac.parent_faction_id)
    .bind(&fac.goals)
    .bind(&fac.secrets)
    .bind(&fac.visibility)
    .bind(&events_json)
    .bind(&image_ref_json)
    .bind(fac.created_at)
    .bind(fac.updated_at)
    .bind(fac.version)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn upsert_character(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    ch: &ImportCharacter,
) -> Result<(), AppError> {
    let appearance_json = serde_json::to_string(&ch.appearance)?;
    let game_stats_json = serde_json::to_string(&ch.game_stats)?;
    let notable_json = serde_json::to_string(&ch.notable_equipment)?;
    let events_json = serde_json::to_string(&ch.events_interesting)?;
    let image_ref_json = ch.image.as_ref().map(serde_json::to_string).transpose()?;

    sqlx::query(
        r#"
        INSERT INTO characters (
            id, campaign_id, name, player_discord_id, current_location_id,
            species, role_hint, game_system_hint, gm_notes, visibility,
            appearance_json, game_stats_json, notable_equipment_json,
            events_interesting_json, image_ref_json, attributes_json, status,
            created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            campaign_id = excluded.campaign_id,
            name = excluded.name,
            player_discord_id = excluded.player_discord_id,
            current_location_id = excluded.current_location_id,
            species = excluded.species,
            role_hint = excluded.role_hint,
            game_system_hint = excluded.game_system_hint,
            gm_notes = excluded.gm_notes,
            visibility = excluded.visibility,
            appearance_json = excluded.appearance_json,
            game_stats_json = excluded.game_stats_json,
            notable_equipment_json = excluded.notable_equipment_json,
            events_interesting_json = excluded.events_interesting_json,
            image_ref_json = COALESCE(excluded.image_ref_json, characters.image_ref_json),
            attributes_json = excluded.attributes_json,
            status = excluded.status,
            updated_at = excluded.updated_at,
            version = excluded.version
        "#,
    )
    .bind(&ch.id)
    .bind(&ch.campaign_id)
    .bind(&ch.name)
    .bind(&ch.player_discord_id)
    .bind(&ch.current_location_id)
    .bind(&ch.species)
    .bind(&ch.role_hint)
    .bind(&ch.game_system_hint)
    .bind(&ch.gm_notes)
    .bind(&ch.visibility)
    .bind(&appearance_json)
    .bind(&game_stats_json)
    .bind(&notable_json)
    .bind(&events_json)
    .bind(&image_ref_json)
    .bind(&game_stats_json)
    .bind(&ch.status)
    .bind(ch.created_at)
    .bind(ch.updated_at)
    .bind(ch.version)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn upsert_npc(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    npc: &ImportNpc,
) -> Result<(), AppError> {
    let appearance_json = serde_json::to_string(&npc.appearance)?;
    let game_stats_json = serde_json::to_string(&npc.game_stats)?;
    let notable_json = serde_json::to_string(&npc.notable_equipment)?;
    let links_json = serde_json::to_string(&npc.links_to_characters)?;
    let events_json = serde_json::to_string(&npc.events_interesting)?;
    let image_ref_json = npc.image.as_ref().map(serde_json::to_string).transpose()?;

    sqlx::query(
        r#"
        INSERT INTO npcs (
            id, campaign_id, name, current_location_id, faction_id,
            species, role_hint, region, scope, reminder, record_kind,
            game_system_hint, gm_notes, visibility, appearance_json, game_stats_json,
            notable_equipment_json, links_to_characters_json, events_interesting_json,
            image_ref_json, attributes_json, status, disposition, description,
            created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            campaign_id = excluded.campaign_id,
            name = excluded.name,
            current_location_id = excluded.current_location_id,
            faction_id = excluded.faction_id,
            species = excluded.species,
            role_hint = excluded.role_hint,
            region = excluded.region,
            scope = excluded.scope,
            reminder = excluded.reminder,
            record_kind = excluded.record_kind,
            game_system_hint = excluded.game_system_hint,
            gm_notes = excluded.gm_notes,
            visibility = excluded.visibility,
            appearance_json = excluded.appearance_json,
            game_stats_json = excluded.game_stats_json,
            notable_equipment_json = excluded.notable_equipment_json,
            links_to_characters_json = excluded.links_to_characters_json,
            events_interesting_json = excluded.events_interesting_json,
            image_ref_json = COALESCE(excluded.image_ref_json, npcs.image_ref_json),
            attributes_json = excluded.attributes_json,
            status = excluded.status,
            disposition = excluded.disposition,
            description = excluded.description,
            updated_at = excluded.updated_at,
            version = excluded.version
        "#,
    )
    .bind(&npc.id)
    .bind(&npc.campaign_id)
    .bind(&npc.name)
    .bind(&npc.current_location_id)
    .bind(&npc.faction_id)
    .bind(&npc.species)
    .bind(&npc.role_hint)
    .bind(&npc.region)
    .bind(&npc.scope)
    .bind(&npc.reminder)
    .bind(&npc.record_kind)
    .bind(&npc.game_system_hint)
    .bind(&npc.gm_notes)
    .bind(&npc.visibility)
    .bind(&appearance_json)
    .bind(&game_stats_json)
    .bind(&notable_json)
    .bind(&links_json)
    .bind(&events_json)
    .bind(&image_ref_json)
    .bind(&game_stats_json)
    .bind(&npc.status)
    .bind(&npc.disposition)
    .bind(&npc.description)
    .bind(npc.created_at)
    .bind(npc.updated_at)
    .bind(npc.version)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn upsert_lore_note(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    note: &ImportLoreNote,
) -> Result<(), AppError> {
    let tags_json = serde_json::to_string(&note.tags)?;
    let linked_json = serde_json::to_string(&note.linked_entities)?;

    sqlx::query(
        r#"
        INSERT INTO lore_notes (
            id, campaign_id, title, kind, body, tags_json, visibility,
            linked_entities_json, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            campaign_id = excluded.campaign_id,
            title = excluded.title,
            kind = excluded.kind,
            body = excluded.body,
            tags_json = excluded.tags_json,
            visibility = excluded.visibility,
            linked_entities_json = excluded.linked_entities_json,
            updated_at = excluded.updated_at,
            version = excluded.version
        "#,
    )
    .bind(&note.id)
    .bind(&note.campaign_id)
    .bind(&note.title)
    .bind(&note.kind)
    .bind(&note.body)
    .bind(&tags_json)
    .bind(&note.visibility)
    .bind(&linked_json)
    .bind(note.created_at)
    .bind(note.updated_at)
    .bind(note.version)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn upsert_narrative_seed(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    seed: &ImportNarrativeSeed,
) -> Result<(), AppError> {
    let tags_json = serde_json::to_string(&seed.tags)?;
    let linked_json = serde_json::to_string(&seed.linked_entities)?;

    sqlx::query(
        r#"
        INSERT INTO narrative_seeds (
            id, campaign_id, title, summary, status, body, tags_json,
            linked_entities_json, first_session_id, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            campaign_id = excluded.campaign_id,
            title = excluded.title,
            summary = excluded.summary,
            status = excluded.status,
            body = excluded.body,
            tags_json = excluded.tags_json,
            linked_entities_json = excluded.linked_entities_json,
            first_session_id = excluded.first_session_id,
            updated_at = excluded.updated_at,
            version = excluded.version
        "#,
    )
    .bind(&seed.id)
    .bind(&seed.campaign_id)
    .bind(&seed.title)
    .bind(&seed.summary)
    .bind(&seed.status)
    .bind(&seed.body)
    .bind(&tags_json)
    .bind(&linked_json)
    .bind(&seed.first_session_id)
    .bind(seed.created_at)
    .bind(seed.updated_at)
    .bind(seed.version)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn upsert_session(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    session: &ImportSession,
) -> Result<(), AppError> {
    let locations_json = serde_json::to_string(&session.locations_visited)?;
    let npcs_json = serde_json::to_string(&session.npcs_encountered)?;
    let play_state = if session.ended_at.is_some() {
        "ended"
    } else {
        "preparing"
    };

    sqlx::query(
        r#"
        INSERT INTO sessions (
            id, campaign_id, number, title, play_state, status, started_at, ended_at,
            summary, events_body, gm_notes, public_summary,
            locations_visited_json, npcs_encountered_json, played_at,
            created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            campaign_id = excluded.campaign_id,
            number = excluded.number,
            title = excluded.title,
            play_state = excluded.play_state,
            status = excluded.status,
            started_at = excluded.started_at,
            ended_at = excluded.ended_at,
            summary = excluded.summary,
            events_body = excluded.events_body,
            gm_notes = excluded.gm_notes,
            public_summary = excluded.public_summary,
            locations_visited_json = excluded.locations_visited_json,
            npcs_encountered_json = excluded.npcs_encountered_json,
            played_at = excluded.played_at,
            updated_at = excluded.updated_at,
            version = excluded.version
        "#,
    )
    .bind(&session.id)
    .bind(&session.campaign_id)
    .bind(session.number)
    .bind(&session.title)
    .bind(play_state)
    .bind(&session.status)
    .bind(session.started_at)
    .bind(session.ended_at)
    .bind(&session.summary)
    .bind(&session.events_body)
    .bind(&session.gm_notes)
    .bind(&session.public_summary)
    .bind(&locations_json)
    .bind(&npcs_json)
    .bind(session.played_at)
    .bind(session.created_at)
    .bind(session.updated_at)
    .bind(session.version)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn upsert_campaign_image(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    image: &ImportCampaignImage,
) -> Result<(), AppError> {
    let links_json = serde_json::to_string(&image.links)?;
    let image_ref_json = image.image.as_ref().map(serde_json::to_string).transpose()?;

    sqlx::query(
        r#"
        INSERT INTO campaign_images (
            id, campaign_id, title, caption, image_ref_json, visibility, links_json,
            created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            campaign_id = excluded.campaign_id,
            title = excluded.title,
            caption = excluded.caption,
            image_ref_json = COALESCE(excluded.image_ref_json, campaign_images.image_ref_json),
            visibility = excluded.visibility,
            links_json = excluded.links_json,
            updated_at = excluded.updated_at,
            version = excluded.version
        "#,
    )
    .bind(&image.id)
    .bind(&image.campaign_id)
    .bind(&image.title)
    .bind(&image.caption)
    .bind(&image_ref_json)
    .bind(&image.visibility)
    .bind(&links_json)
    .bind(image.created_at)
    .bind(image.updated_at)
    .bind(image.version)
    .execute(&mut **tx)
    .await?;

    Ok(())
}
