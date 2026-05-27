use std::fs;
use std::path::Path;

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::AppHandle;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::vault_json::{parse_json, parse_json_opt, ImageLink, ImageRef};
use crate::models::CampaignImageRow;
use crate::services::campaign_storage;
use crate::services::import_images::{entity_image_dir, hash_file};
use crate::util::now_ms;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairCampaignPortraitsReport {
    pub campaign_id: String,
    pub migrated_to_archive: usize,
    pub synced_from_links: usize,
    pub synced_from_bindings: usize,
    pub errors: Vec<String>,
}

fn is_entity_scoped_portrait_path(entity_id: &str, local: &str) -> bool {
    let prefix = format!("images/{entity_id}/");
    local.starts_with(&prefix)
}

fn links_contain_entity(links: &[ImageLink], kind: &str, entity_id: &str) -> bool {
    links
        .iter()
        .any(|link| link.kind == kind && link.id == entity_id)
}

async fn update_entity_image_ref(
    pool: &SqlitePool,
    table: &str,
    entity_id: &str,
    image_ref: &ImageRef,
) -> Result<(), AppError> {
    let json = serde_json::to_string(image_ref)?;
    let now = now_ms();
    let sql = format!("UPDATE {table} SET image_ref_json = ?, updated_at = ? WHERE id = ?");
    sqlx::query(&sql)
        .bind(&json)
        .bind(now)
        .bind(entity_id)
        .execute(pool)
        .await?;
    Ok(())
}

async fn load_campaign_images(
    pool: &SqlitePool,
    campaign_id: &str,
) -> Result<Vec<CampaignImageRow>, AppError> {
    let rows = sqlx::query_as::<_, CampaignImageRow>(
        r#"
        SELECT id, campaign_id, title, caption, image_ref_json, visibility, links_json,
               created_at, updated_at, version
        FROM campaign_images
        WHERE campaign_id = ?
        "#,
    )
    .bind(campaign_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Copies an entity-scoped L1 portrait into a new archive row and links it to the subject.
async fn migrate_orphan_portrait(
    app: &AppHandle,
    pool: &SqlitePool,
    campaign_id: &str,
    table: &str,
    link_kind: &str,
    entity_id: &str,
    entity_name: &str,
    image_ref: &ImageRef,
    report_errors: &mut Vec<String>,
) -> Result<bool, AppError> {
    let local = match image_ref.local.as_deref() {
        Some(local) if is_entity_scoped_portrait_path(entity_id, local) => local,
        _ => return Ok(false),
    };

    let folder = campaign_storage::resolve_storage_folder(app, campaign_id)?;
    let source = campaign_storage::images_dir(&folder).join(local);
    if !source.is_file() {
        report_errors.push(format!(
            "orphan portrait file missing for {link_kind} {entity_id}: {}",
            source.display()
        ));
        return Ok(false);
    }

    let images = load_campaign_images(pool, campaign_id).await?;
    for row in &images {
        let links: Vec<ImageLink> = parse_json(&row.links_json, Vec::new());
        if !links_contain_entity(&links, link_kind, entity_id) {
            continue;
        }
        if let Some(ref existing) = parse_json_opt(row.image_ref_json.as_deref()) {
            update_entity_image_ref(pool, table, entity_id, existing).await?;
            return Ok(true);
        }
    }

    let campaign_image_id = Uuid::now_v7().to_string();
    let dest_dir = entity_image_dir(app, campaign_id, &campaign_image_id)?;
    fs::create_dir_all(&dest_dir).map_err(|e| AppError::Internal(e.to_string()))?;

    let extension = Path::new(local)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .unwrap_or_else(|| "jpg".to_string());
    let file_name = format!("original.{extension}");
    let dest_file = dest_dir.join(&file_name);
    fs::copy(&source, &dest_file).map_err(|e| AppError::Internal(e.to_string()))?;

    let hash = hash_file(&dest_file)?;
    let archive_ref = ImageRef {
        local: Some(format!("images/{campaign_image_id}/{file_name}")),
        hash: Some(hash),
        thumbnail_url: None,
        canon_url: None,
        token_portrait_url: None,
    };
    let image_ref_json = serde_json::to_string(&archive_ref)?;
    let links = if link_kind == "faction" {
        Vec::<ImageLink>::new()
    } else {
        vec![ImageLink {
            kind: link_kind.to_string(),
            id: entity_id.to_string(),
        }]
    };
    let links_json = serde_json::to_string(&links)?;
    let now = now_ms();

    sqlx::query(
        r#"
        INSERT INTO campaign_images (
            id, campaign_id, title, caption, image_ref_json, visibility, links_json,
            created_at, updated_at, version
        ) VALUES (?, ?, ?, '', ?, 'gm_only', ?, ?, ?, 1)
        "#,
    )
    .bind(&campaign_image_id)
    .bind(campaign_id)
    .bind(entity_name)
    .bind(&image_ref_json)
    .bind(&links_json)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    update_entity_image_ref(pool, table, entity_id, &archive_ref).await?;
    Ok(true)
}

async fn sync_portraits_from_campaign_image_links(
    pool: &SqlitePool,
    campaign_id: &str,
) -> Result<usize, AppError> {
    let rows = load_campaign_images(pool, campaign_id).await?;
    let mut synced = 0usize;

    for row in rows {
        let Some(image_ref) = parse_json_opt(row.image_ref_json.as_deref()) else {
            continue;
        };
        let links: Vec<ImageLink> = parse_json(&row.links_json, Vec::new());
        for link in links {
            let table = match link.kind.as_str() {
                "character" => "characters",
                "npc" => "npcs",
                "location" => "locations",
                _ => continue,
            };
            update_entity_image_ref(pool, table, &link.id, &image_ref).await?;
            synced += 1;
        }
    }

    Ok(synced)
}

async fn migrate_orphans_for_table(
    app: &AppHandle,
    pool: &SqlitePool,
    campaign_id: &str,
    table: &str,
    link_kind: &str,
    name_column: &str,
    report_errors: &mut Vec<String>,
) -> Result<usize, AppError> {
    let sql = format!(
        "SELECT id, {name_column} AS name, image_ref_json FROM {table} WHERE campaign_id = ?"
    );
    let rows = sqlx::query_as::<_, (String, String, Option<String>)>(&sql)
        .bind(campaign_id)
        .fetch_all(pool)
        .await?;

    let mut migrated = 0usize;
    for (id, name, image_ref_json) in rows {
        let Some(image_ref) = parse_json_opt(image_ref_json.as_deref()) else {
            continue;
        };
        if migrate_orphan_portrait(
            app,
            pool,
            campaign_id,
            table,
            link_kind,
            &id,
            &name,
            &image_ref,
            report_errors,
        )
        .await?
        {
            migrated += 1;
        }
    }
    Ok(migrated)
}

/// Repairs portrait ↔ archive links for an already-imported campaign (POC migration fix).
pub async fn repair_campaign_image_portraits(
    app: &AppHandle,
    campaign_id: &str,
    pool: &SqlitePool,
) -> Result<RepairCampaignPortraitsReport, AppError> {
    let mut errors = Vec::new();
    let mut migrated_to_archive = 0usize;

    migrated_to_archive += migrate_orphans_for_table(
        app,
        pool,
        campaign_id,
        "characters",
        "character",
        "name",
        &mut errors,
    )
    .await?;
    migrated_to_archive += migrate_orphans_for_table(
        app,
        pool,
        campaign_id,
        "npcs",
        "npc",
        "name",
        &mut errors,
    )
    .await?;
    migrated_to_archive += migrate_orphans_for_table(
        app,
        pool,
        campaign_id,
        "locations",
        "location",
        "name",
        &mut errors,
    )
    .await?;
    migrated_to_archive += migrate_orphans_for_table(
        app,
        pool,
        campaign_id,
        "factions",
        "faction",
        "name",
        &mut errors,
    )
    .await?;

    let synced_from_links = sync_portraits_from_campaign_image_links(pool, campaign_id).await?;

    Ok(RepairCampaignPortraitsReport {
        campaign_id: campaign_id.to_string(),
        migrated_to_archive,
        synced_from_links,
        synced_from_bindings: 0,
        errors,
    })
}

pub async fn apply_portrait_bindings(
    pool: &SqlitePool,
    bindings: &[(String, String, String)],
    image_refs: &std::collections::HashMap<String, ImageRef>,
) -> Result<usize, AppError> {
    let mut applied = 0usize;
    for (entity_kind, entity_id, campaign_image_id) in bindings {
        let Some(image_ref) = image_refs.get(campaign_image_id) else {
            continue;
        };
        let table = match entity_kind.as_str() {
            "character" => "characters",
            "npc" => "npcs",
            "location" => "locations",
            "faction" => "factions",
            _ => continue,
        };
        update_entity_image_ref(pool, table, entity_id, image_ref).await?;
        applied += 1;
    }
    Ok(applied)
}

/// After import: set entity portraits from bindings, then sync any linked archive rows.
pub async fn finalize_imported_portraits(
    pool: &SqlitePool,
    campaign_id: &str,
    bindings: &[(String, String, String)],
    image_refs: &std::collections::HashMap<String, ImageRef>,
) -> Result<(usize, usize), AppError> {
    let synced_from_bindings = apply_portrait_bindings(pool, bindings, image_refs).await?;
    let synced_from_links = sync_portraits_from_campaign_image_links(pool, campaign_id).await?;
    Ok((synced_from_bindings, synced_from_links))
}
