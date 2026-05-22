use sqlx::SqlitePool;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::{Token, TokenRow, normalize_optional_discord_id};
use crate::util::now_ms;

pub const TOKEN_SELECT: &str = r#"
        SELECT id, map_id, entity_kind, entity_id, session_id, display_name, zone, x_cell, y_cell, bench_slot,
               visible_to_players, controlled_by_discord_id, created_at, updated_at, version
        FROM tokens
"#;

/// Idempotent: one bench token per active character on every campaign map.
pub async fn ensure_character_tokens_for_campaign(
    pool: &SqlitePool,
    campaign_id: &str,
) -> AppResult<u32> {
    let map_ids: Vec<String> = sqlx::query_scalar("SELECT id FROM maps WHERE campaign_id = ?")
        .bind(campaign_id)
        .fetch_all(pool)
        .await?;

    let mut created = 0u32;
    for map_id in map_ids {
        created += ensure_character_tokens_for_map(pool, &map_id, campaign_id).await?;
    }
    Ok(created)
}

pub async fn ensure_character_tokens_for_map(
    pool: &SqlitePool,
    map_id: &str,
    campaign_id: &str,
) -> AppResult<u32> {
    let bench_slots: i32 =
        sqlx::query_scalar("SELECT bench_slots FROM maps WHERE id = ? AND campaign_id = ?")
            .bind(map_id)
            .bind(campaign_id)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("map {map_id}")))?;

    let characters: Vec<(String, Option<String>)> = sqlx::query_as(
        "SELECT id, player_discord_id FROM characters WHERE campaign_id = ? AND status = 'active'",
    )
    .bind(campaign_id)
    .fetch_all(pool)
    .await?;

    let mut created = 0u32;
    for (character_id, player_discord_id) in characters {
        let player_discord_id = normalize_optional_discord_id(player_discord_id);
        let exists: Option<i64> = sqlx::query_scalar(
            "SELECT 1 FROM tokens WHERE map_id = ? AND entity_kind = 'character' AND entity_id = ?",
        )
        .bind(map_id)
        .bind(&character_id)
        .fetch_optional(pool)
        .await?;

        if exists.is_some() {
            if let Some(ref discord_id) = player_discord_id {
                sqlx::query(
                    r#"
                    UPDATE tokens
                    SET controlled_by_discord_id = ?, updated_at = ?, version = version + 1
                    WHERE map_id = ? AND entity_kind = 'character' AND entity_id = ?
                      AND controlled_by_discord_id IS NULL
                    "#,
                )
                .bind(discord_id)
                .bind(now_ms())
                .bind(map_id)
                .bind(&character_id)
                .execute(pool)
                .await?;
            }
            continue;
        }

        let bench_slot = first_free_bench_slot(pool, map_id, bench_slots).await?;
        let id = Uuid::now_v7().to_string();
        let now = now_ms();
        sqlx::query(
            r#"
            INSERT INTO tokens (
                id, map_id, entity_kind, entity_id, session_id, display_name, zone, x_cell, y_cell, bench_slot,
                visible_to_players, controlled_by_discord_id, created_at, updated_at, version
            ) VALUES (?, ?, 'character', ?, NULL, NULL, 'bench', NULL, NULL, ?, 1, ?, ?, ?, 1)
            "#,
        )
        .bind(&id)
        .bind(map_id)
        .bind(&character_id)
        .bind(bench_slot)
        .bind(&player_discord_id)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await?;
        created += 1;
    }
    Ok(created)
}

pub async fn first_free_bench_slot(
    pool: &SqlitePool,
    map_id: &str,
    bench_slots: i32,
) -> AppResult<i32> {
    let occupied: Vec<i32> = sqlx::query_scalar(
        "SELECT bench_slot FROM tokens WHERE map_id = ? AND zone = 'bench' AND bench_slot IS NOT NULL",
    )
    .bind(map_id)
    .fetch_all(pool)
    .await?;

    let slots = bench_slots.max(1);
    for slot in 0..slots {
        if !occupied.contains(&slot) {
            return Ok(slot);
        }
    }
    Err(AppError::Internal("no free bench slot".into()))
}

pub async fn campaign_id_for_map(pool: &SqlitePool, map_id: &str) -> AppResult<String> {
    sqlx::query_scalar("SELECT campaign_id FROM maps WHERE id = ?")
        .bind(map_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("map {map_id}")))
}

pub async fn fetch_token(pool: &SqlitePool, token_id: &str) -> AppResult<Token> {
    let query = format!("{TOKEN_SELECT} WHERE id = ?");
    let row = sqlx::query_as::<_, TokenRow>(&query)
        .bind(token_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("token {token_id}")))?;
    Token::from_row(row).map_err(AppError::Internal)
}

pub fn player_can_move_token(token: &Token, requester_discord_id: &str) -> bool {
    token.visible_to_players
        && token
            .controlled_by_player_discord_id
            .as_deref()
            == Some(requester_discord_id)
}

pub async fn character_player_discord_id(
    pool: &SqlitePool,
    campaign_id: &str,
    character_id: &str,
) -> AppResult<Option<String>> {
    sqlx::query_scalar(
        "SELECT player_discord_id FROM characters WHERE id = ? AND campaign_id = ?",
    )
    .bind(character_id)
    .bind(campaign_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::from)
}

pub async fn discord_id_linked_to_campaign(
    pool: &SqlitePool,
    campaign_id: &str,
    discord_id: &str,
) -> AppResult<bool> {
    let found: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM characters WHERE campaign_id = ? AND player_discord_id = ? LIMIT 1",
    )
    .bind(campaign_id)
    .bind(discord_id)
    .fetch_optional(pool)
    .await?;
    Ok(found.is_some())
}

pub fn normalize_display_name(name: &str) -> AppResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Internal("display name is required".into()));
    }
    if trimmed.chars().count() > 120 {
        return Err(AppError::Internal("display name is too long (max 120)".into()));
    }
    Ok(trimmed.to_string())
}

pub fn token_literal_label(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return "?".into();
    }
    let words: Vec<&str> = trimmed.split_whitespace().filter(|w| !w.is_empty()).collect();
    if words.len() >= 2 {
        let from_words: String = words
            .iter()
            .take(3)
            .filter_map(|w| w.chars().next())
            .collect::<String>()
            .to_uppercase();
        if from_words.len() >= 2 {
            return from_words.chars().take(3).collect();
        }
    }
    let alnum: String = trimmed
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect();
    if alnum.len() >= 2 {
        return alnum.chars().take(2).collect::<String>().to_uppercase();
    }
    trimmed.chars().take(2).collect::<String>().to_uppercase()
}
