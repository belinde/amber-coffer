use tauri::AppHandle;

use crate::error::AppError;
use crate::models::vault_json::{EventReference, ImageLink};
use crate::services::campaign_storage;
use crate::validation_issue::{enum_invalid, generic_invalid, validation_issues, ValidationIssue};

pub async fn ensure_campaign_exists(handle: &AppHandle, campaign_id: &str) -> Result<(), AppError> {
    if !campaign_storage::campaign_exists(handle, campaign_id) {
        return Err(AppError::NotFound(format!("campaign {campaign_id}")));
    }
    Ok(())
}

pub async fn ensure_location_in_campaign(
    pool: &sqlx::SqlitePool,
    location_id: &str,
    campaign_id: &str,
) -> Result<(), AppError> {
    let exists: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM locations WHERE id = ? AND campaign_id = ?",
    )
    .bind(location_id)
    .bind(campaign_id)
    .fetch_optional(pool)
    .await?;

    if exists.is_some() {
        Ok(())
    } else {
        Err(AppError::NotFound("location".into()))
    }
}

pub async fn ensure_faction_in_campaign(
    pool: &sqlx::SqlitePool,
    faction_id: &str,
    campaign_id: &str,
) -> Result<(), AppError> {
    let exists: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM factions WHERE id = ? AND campaign_id = ?",
    )
    .bind(faction_id)
    .bind(campaign_id)
    .fetch_optional(pool)
    .await?;

    if exists.is_some() {
        Ok(())
    } else {
        Err(AppError::NotFound("faction".into()))
    }
}

pub async fn ensure_parent_location(
    pool: &sqlx::SqlitePool,
    parent_id: &str,
    campaign_id: &str,
    self_id: Option<&str>,
) -> Result<(), AppError> {
    if Some(parent_id) == self_id {
        return Err(generic_invalid(&["parentId"]));
    }
    ensure_location_in_campaign(pool, parent_id, campaign_id).await
}

pub async fn ensure_entity_in_campaign(
    pool: &sqlx::SqlitePool,
    campaign_id: &str,
    kind: &str,
    entity_id: &str,
) -> Result<(), AppError> {
    let exists: Option<i64> = match kind {
        "character" => {
            sqlx::query_scalar("SELECT 1 FROM characters WHERE id = ? AND campaign_id = ?")
                .bind(entity_id)
                .bind(campaign_id)
                .fetch_optional(pool)
                .await?
        }
        "npc" => {
            sqlx::query_scalar("SELECT 1 FROM npcs WHERE id = ? AND campaign_id = ?")
                .bind(entity_id)
                .bind(campaign_id)
                .fetch_optional(pool)
                .await?
        }
        "location" => {
            sqlx::query_scalar("SELECT 1 FROM locations WHERE id = ? AND campaign_id = ?")
                .bind(entity_id)
                .bind(campaign_id)
                .fetch_optional(pool)
                .await?
        }
        "faction" => {
            sqlx::query_scalar("SELECT 1 FROM factions WHERE id = ? AND campaign_id = ?")
                .bind(entity_id)
                .bind(campaign_id)
                .fetch_optional(pool)
                .await?
        }
        "item" => {
            sqlx::query_scalar("SELECT 1 FROM items WHERE id = ? AND campaign_id = ?")
                .bind(entity_id)
                .bind(campaign_id)
                .fetch_optional(pool)
                .await?
        }
        "lore_note" => {
            sqlx::query_scalar("SELECT 1 FROM lore_notes WHERE id = ? AND campaign_id = ?")
                .bind(entity_id)
                .bind(campaign_id)
                .fetch_optional(pool)
                .await?
        }
        "narrative_seed" => {
            sqlx::query_scalar(
                "SELECT 1 FROM narrative_seeds WHERE id = ? AND campaign_id = ?",
            )
            .bind(entity_id)
            .bind(campaign_id)
            .fetch_optional(pool)
            .await?
        }
        _ => {
            return Err(validation_issues(vec![ValidationIssue::new(
                &["entityKind"],
                "enum.invalid",
            )]))
        }
    };

    if exists.is_some() {
        Ok(())
    } else {
        Err(AppError::NotFound(kind.into()))
    }
}

pub async fn ensure_parent_faction(
    pool: &sqlx::SqlitePool,
    parent_id: &str,
    campaign_id: &str,
    self_id: Option<&str>,
) -> Result<(), AppError> {
    if Some(parent_id) == self_id {
        return Err(generic_invalid(&["parentFactionId"]));
    }
    ensure_faction_in_campaign(pool, parent_id, campaign_id).await
}

pub async fn ensure_session_in_campaign(
    pool: &sqlx::SqlitePool,
    session_id: &str,
    campaign_id: &str,
) -> Result<(), AppError> {
    let exists: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM sessions WHERE id = ? AND campaign_id = ?",
    )
    .bind(session_id)
    .bind(campaign_id)
    .fetch_optional(pool)
    .await?;

    if exists.is_some() {
        Ok(())
    } else {
        Err(AppError::NotFound("session".into()))
    }
}

pub async fn validate_events_interesting(
    pool: &sqlx::SqlitePool,
    campaign_id: &str,
    events: &[EventReference],
) -> Result<(), AppError> {
    for (index, event) in events.iter().enumerate() {
        let index_key = index.to_string();
        if event.summary.trim().is_empty() {
            return Err(validation_issues(vec![ValidationIssue::with_min(
                &["eventsInteresting", &index_key, "summary"],
                1,
            )]));
        }

        let exists: Option<i64> = sqlx::query_scalar(
            "SELECT 1 FROM sessions WHERE id = ? AND campaign_id = ?",
        )
        .bind(&event.session_id)
        .bind(campaign_id)
        .fetch_optional(pool)
        .await?;

        if exists.is_none() {
            return Err(enum_invalid(&[
                "eventsInteresting",
                &index_key,
                "sessionId",
            ]));
        }
    }
    Ok(())
}

pub async fn validate_image_links(
    pool: &sqlx::SqlitePool,
    campaign_id: &str,
    links: &[ImageLink],
) -> Result<(), AppError> {
    const ALLOWED: &[&str] = &["character", "npc", "location", "session"];
    for (index, link) in links.iter().enumerate() {
        let index_key = index.to_string();
        if !ALLOWED.contains(&link.kind.as_str()) {
            return Err(enum_invalid(&["links", &index_key, "kind"]));
        }
        match link.kind.as_str() {
            "character" | "npc" | "location" => {
                ensure_entity_in_campaign(pool, campaign_id, &link.kind, &link.id).await?;
            }
            "session" => ensure_session_in_campaign(pool, &link.id, campaign_id).await?,
            _ => return Err(enum_invalid(&["links", &index_key, "kind"])),
        }
    }
    Ok(())
}

pub async fn ensure_item_owner(
    pool: &sqlx::SqlitePool,
    campaign_id: &str,
    owner_kind: Option<&str>,
    owner_id: Option<&str>,
) -> Result<(), AppError> {
    match (owner_kind, owner_id) {
        (None, None) => Ok(()),
        (None, Some(_)) | (Some(_), None) => Err(validation_issues(vec![
            ValidationIssue::new(&["ownerKind"], "generic.invalid"),
        ])),
        (Some(kind), Some(id)) => ensure_entity_in_campaign(pool, campaign_id, kind, id).await,
    }
}
