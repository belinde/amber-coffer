use std::collections::HashMap;

use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::db::validate::ensure_entity_in_campaign;
use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::{Handout, HandoutRow, Map, Token, TokenPosition, TokenRow, normalize_optional_discord_id};
use crate::services::tabletop_tokens::{
    self, campaign_id_for_map, character_player_discord_id, discord_id_linked_to_campaign,
    fetch_token, first_free_bench_slot, normalize_display_name, player_can_move_token,
    token_literal_label, TOKEN_SELECT,
};
use crate::util::now_ms;

const MAP_SELECT: &str = r#"
        SELECT id, campaign_id, name, image_path, background_public_path, width_px, height_px,
               grid_size_px, grid_cols, grid_rows, bench_slots, created_at, updated_at, version
        FROM maps
"#;

fn parse_position(value: serde_json::Value) -> AppResult<TokenPosition> {
    let pos: TokenPosition =
        serde_json::from_value(value).map_err(|e| AppError::Internal(e.to_string()))?;
    match pos.zone.as_str() {
        "board" if pos.x_cell.is_some() && pos.y_cell.is_some() => Ok(pos),
        "bench" if pos.slot.is_some() => Ok(pos),
        _ => Err(AppError::Internal("invalid token position".into())),
    }
}

fn validate_token_entity_kind(kind: &str) -> AppResult<()> {
    if kind == "character" || kind == "npc" {
        Ok(())
    } else {
        Err(AppError::Internal(format!(
            "unsupported token entity kind: {kind}"
        )))
    }
}

async fn load_token_row(pool: &sqlx::SqlitePool, token_id: &str) -> AppResult<Token> {
    fetch_token(pool, token_id).await
}

#[tauri::command]
pub async fn list_tokens(
    map_id: String,
    session_id: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<Token>, AppError> {
    let pool = state.pool_for_entity_id(&app, &map_id).await?;
    let rows = if let Some(ref session_id) = session_id {
        let query = format!(
            "{TOKEN_SELECT} WHERE map_id = ? AND (entity_kind != 'custom' OR session_id = ?) ORDER BY created_at"
        );
        sqlx::query_as::<_, TokenRow>(&query)
            .bind(&map_id)
            .bind(session_id)
            .fetch_all(&pool)
            .await?
    } else {
        let query =
            format!("{TOKEN_SELECT} WHERE map_id = ? AND entity_kind != 'custom' ORDER BY created_at");
        sqlx::query_as::<_, TokenRow>(&query)
            .bind(&map_id)
            .fetch_all(&pool)
            .await?
    };

    rows.into_iter()
        .map(|row| Token::from_row(row).map_err(AppError::Internal))
        .collect()
}

#[tauri::command]
pub async fn move_token(
    token_id: String,
    position_json: serde_json::Value,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Token, AppError> {
    let pool = state.pool_for_entity_id(&app, &token_id).await?;
    let position = parse_position(position_json)?;
    let now = now_ms();

    let (zone, x_cell, y_cell, bench_slot) = match position.zone.as_str() {
        "board" => (
            "board",
            position.x_cell,
            position.y_cell,
            None::<i32>,
        ),
        "bench" => ("bench", None, None, position.slot),
        _ => return Err(AppError::Internal("invalid token zone".into())),
    };

    let updated = sqlx::query(
        r#"
        UPDATE tokens
        SET zone = ?, x_cell = ?, y_cell = ?, bench_slot = ?, updated_at = ?, version = version + 1
        WHERE id = ?
        "#,
    )
    .bind(zone)
    .bind(x_cell)
    .bind(y_cell)
    .bind(bench_slot)
    .bind(now)
    .bind(&token_id)
    .execute(&pool)
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("token {token_id}")));
    }

    load_token_row(&pool, &token_id).await
}

#[tauri::command]
pub async fn place_token(
    map_id: String,
    entity_kind: String,
    entity_id: String,
    position_json: Option<serde_json::Value>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Token, AppError> {
    validate_token_entity_kind(&entity_kind)?;

    let pool = state.pool_for_entity_id(&app, &map_id).await?;
    let campaign_id = campaign_id_for_map(&pool, &map_id).await?;
    ensure_entity_in_campaign(&pool, &campaign_id, &entity_kind, &entity_id).await?;

    let exists: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM tokens WHERE map_id = ? AND entity_kind = ? AND entity_id = ?",
    )
    .bind(&map_id)
    .bind(&entity_kind)
    .bind(&entity_id)
    .fetch_optional(&pool)
    .await?;
    if exists.is_some() {
        return Err(AppError::Internal(
            "token already exists for this entity on this map".into(),
        ));
    }

    let bench_slots: i32 = sqlx::query_scalar("SELECT bench_slots FROM maps WHERE id = ?")
        .bind(&map_id)
        .fetch_one(&pool)
        .await?;

    let position = match position_json {
        Some(json) => parse_position(json)?,
        None => TokenPosition {
            zone: "bench".into(),
            x_cell: None,
            y_cell: None,
            slot: Some(first_free_bench_slot(&pool, &map_id, bench_slots).await?),
        },
    };

    let controlled_by = normalize_optional_discord_id(
        if entity_kind == "character" {
            character_player_discord_id(&pool, &campaign_id, &entity_id).await?
        } else {
            None
        },
    );

    let (zone, x_cell, y_cell, bench_slot) = match position.zone.as_str() {
        "board" => (
            "board",
            position.x_cell,
            position.y_cell,
            None::<i32>,
        ),
        "bench" => ("bench", None, None, position.slot),
        _ => return Err(AppError::Internal("invalid token zone".into())),
    };

    let id = Uuid::now_v7().to_string();
    let now = now_ms();
    sqlx::query(
        r#"
        INSERT INTO tokens (
            id, map_id, entity_kind, entity_id, session_id, display_name, zone, x_cell, y_cell, bench_slot,
            visible_to_players, controlled_by_discord_id, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, 1, ?, ?, ?, 1)
        "#,
    )
    .bind(&id)
    .bind(&map_id)
    .bind(&entity_kind)
    .bind(&entity_id)
    .bind(zone)
    .bind(x_cell)
    .bind(y_cell)
    .bind(bench_slot)
    .bind(&controlled_by)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await?;

    load_token_row(&pool, &id).await
}

#[tauri::command]
pub async fn create_custom_session_token(
    session_id: String,
    map_id: String,
    display_name: String,
    controlled_by_discord_id: Option<String>,
    position_json: Option<serde_json::Value>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Token, AppError> {
    let pool = state.pool_for_entity_id(&app, &session_id).await?;
    let display_name = normalize_display_name(&display_name)?;

    let session_campaign: Option<String> = sqlx::query_scalar(
        "SELECT campaign_id FROM sessions WHERE id = ?",
    )
    .bind(&session_id)
    .fetch_optional(&pool)
    .await?;
    let campaign_id = session_campaign
        .ok_or_else(|| AppError::NotFound(format!("session {session_id}")))?;

    let map_campaign = campaign_id_for_map(&pool, &map_id).await?;
    if map_campaign != campaign_id {
        return Err(AppError::Internal(
            "map does not belong to the session campaign".into(),
        ));
    }

    let controlled_by = normalize_optional_discord_id(controlled_by_discord_id);
    if let Some(ref discord_id) = controlled_by {
        if !discord_id_linked_to_campaign(&pool, &campaign_id, discord_id).await? {
            return Err(AppError::Internal(
                "discord user is not linked to a player character in this campaign".into(),
            ));
        }
    }

    let bench_slots: i32 = sqlx::query_scalar("SELECT bench_slots FROM maps WHERE id = ?")
        .bind(&map_id)
        .fetch_one(&pool)
        .await?;

    let position = match position_json {
        Some(json) => parse_position(json)?,
        None => TokenPosition {
            zone: "bench".into(),
            x_cell: None,
            y_cell: None,
            slot: Some(first_free_bench_slot(&pool, &map_id, bench_slots).await?),
        },
    };

    let (zone, x_cell, y_cell, bench_slot) = match position.zone.as_str() {
        "board" => (
            "board",
            position.x_cell,
            position.y_cell,
            None::<i32>,
        ),
        "bench" => ("bench", None, None, position.slot),
        _ => return Err(AppError::Internal("invalid token zone".into())),
    };

    let id = Uuid::now_v7().to_string();
    let now = now_ms();
    sqlx::query(
        r#"
        INSERT INTO tokens (
            id, map_id, entity_kind, entity_id, session_id, display_name, zone, x_cell, y_cell, bench_slot,
            visible_to_players, controlled_by_discord_id, created_at, updated_at, version
        ) VALUES (?, ?, 'custom', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 1)
        "#,
    )
    .bind(&id)
    .bind(&map_id)
    .bind(&id)
    .bind(&session_id)
    .bind(&display_name)
    .bind(zone)
    .bind(x_cell)
    .bind(y_cell)
    .bind(bench_slot)
    .bind(&controlled_by)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await?;

    load_token_row(&pool, &id).await
}

#[tauri::command]
pub async fn remove_token(
    token_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let pool = state.pool_for_entity_id(&app, &token_id).await?;
    let deleted = sqlx::query("DELETE FROM tokens WHERE id = ?")
        .bind(&token_id)
        .execute(&pool)
        .await?;
    if deleted.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("token {token_id}")));
    }
    Ok(())
}

#[tauri::command]
pub async fn set_token_controller(
    token_id: String,
    controlled_by_discord_id: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Token, AppError> {
    let pool = state.pool_for_entity_id(&app, &token_id).await?;
    let token = load_token_row(&pool, &token_id).await?;
    let campaign_id = campaign_id_for_map(&pool, &token.map_id).await?;
    let controlled_by_discord_id = normalize_optional_discord_id(controlled_by_discord_id);

    if let Some(ref discord_id) = controlled_by_discord_id {
        if !discord_id_linked_to_campaign(&pool, &campaign_id, discord_id).await? {
            return Err(AppError::Internal(
                "discord user is not linked to a player character in this campaign".into(),
            ));
        }
    }

    let now = now_ms();
    let updated = sqlx::query(
        r#"
        UPDATE tokens
        SET controlled_by_discord_id = ?, updated_at = ?, version = version + 1
        WHERE id = ?
        "#,
    )
    .bind(&controlled_by_discord_id)
    .bind(now)
    .bind(&token_id)
    .execute(&pool)
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("token {token_id}")));
    }

    load_token_row(&pool, &token_id).await
}

#[tauri::command]
pub async fn set_token_visibility(
    token_id: String,
    visible_to_players: bool,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Token, AppError> {
    let pool = state.pool_for_entity_id(&app, &token_id).await?;
    let now = now_ms();
    let visible = if visible_to_players { 1 } else { 0 };
    let updated = sqlx::query(
        r#"
        UPDATE tokens
        SET visible_to_players = ?, updated_at = ?, version = version + 1
        WHERE id = ?
        "#,
    )
    .bind(visible)
    .bind(now)
    .bind(&token_id)
    .execute(&pool)
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("token {token_id}")));
    }

    load_token_row(&pool, &token_id).await
}

#[tauri::command]
pub async fn ensure_campaign_character_tokens(
    campaign_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<u32, AppError> {
    let pool = state.pool_for_campaign(&app, &campaign_id).await?;
    tabletop_tokens::ensure_character_tokens_for_campaign(&pool, &campaign_id).await
}

#[tauri::command]
pub async fn resolve_token_move_request(
    token_id: String,
    accepted: bool,
    final_position_json: Option<serde_json::Value>,
    requester_discord_id: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, AppError> {
    if !accepted {
        return Ok(serde_json::json!({ "accepted": false }));
    }

    let pool = state.pool_for_entity_id(&app, &token_id).await?;

    if let Some(ref requester) = requester_discord_id {
        let token = load_token_row(&pool, &token_id).await?;
        if !player_can_move_token(&token, requester) {
            return Ok(serde_json::json!({ "accepted": false, "reason": "not_authorized" }));
        }
    }

    let position = final_position_json.ok_or_else(|| {
        AppError::Internal("final position required when accepting move".into())
    })?;
    let token = move_token(token_id, position, app, state).await?;
    Ok(serde_json::json!({ "accepted": true, "token": token }))
}

async fn build_token_display_maps(
    pool: &sqlx::SqlitePool,
    campaign_id: &str,
    tokens: &[Token],
) -> AppResult<(HashMap<String, String>, HashMap<String, String>)> {
    let mut labels: HashMap<String, String> = HashMap::new();
    let mut names: HashMap<String, String> = HashMap::new();

    for token in tokens {
        let name: Option<String> = match token.entity_kind.as_str() {
            "character" => {
                sqlx::query_scalar("SELECT name FROM characters WHERE id = ? AND campaign_id = ?")
                    .bind(&token.entity_id)
                    .bind(campaign_id)
                    .fetch_optional(pool)
                    .await?
            }
            "npc" => {
                sqlx::query_scalar("SELECT name FROM npcs WHERE id = ? AND campaign_id = ?")
                    .bind(&token.entity_id)
                    .bind(campaign_id)
                    .fetch_optional(pool)
                    .await?
            }
            "custom" => token.display_name.clone(),
            _ => None,
        };
        if let Some(name) = name {
            labels.insert(token.id.clone(), token_literal_label(&name));
            names.insert(token.id.clone(), name);
        }
    }

    Ok((labels, names))
}

/// Build a map of token ID → portrait URL for tokens that have
/// a portrait available. Uses CloudFront URL if uploaded, otherwise falls back
/// to the local image path (via asset:// protocol) when a clip_region is defined.
async fn build_token_portrait_urls(
    pool: &sqlx::SqlitePool,
    campaign_id: &str,
    tokens: &[Token],
    campaign_storage_root: Option<&std::path::Path>,
) -> AppResult<HashMap<String, String>> {
    use crate::models::vault_json::{parse_json, parse_json_opt, ImageLink, ImageRef};

    let mut portrait_urls: HashMap<String, String> = HashMap::new();

    // Collect entity IDs that need portrait lookup (characters and NPCs only)
    let entity_tokens: Vec<&Token> = tokens
        .iter()
        .filter(|t| t.entity_kind == "character" || t.entity_kind == "npc")
        .collect();

    if entity_tokens.is_empty() {
        return Ok(portrait_urls);
    }

    // Load all campaign images for this campaign (with their links, image refs, and clip region)
    let image_rows = sqlx::query_as::<_, (String, Option<String>, String, Option<String>)>(
        "SELECT id, image_ref_json, links_json, clip_region_json FROM campaign_images WHERE campaign_id = ?",
    )
    .bind(campaign_id)
    .fetch_all(pool)
    .await?;

    // Build a lookup: (entity_kind, entity_id) → portrait URL
    // Build portrait URLs.
    // When campaign_storage_root is provided (master-app local), always prefer the local
    // crop cache — the relative CloudFront paths don't work in the Tauri webview.
    // When campaign_storage_root is None (snapshot for player-activity), use CloudFront paths.
    let mut entity_portrait_map: HashMap<(String, String), String> = HashMap::new();

    for (_image_id, image_ref_json, links_json, clip_region_json) in &image_rows {
        let image_ref: Option<ImageRef> = parse_json_opt(image_ref_json.as_deref());

        let url = if let Some(ref ir) = image_ref {
            if let Some(clip_json) = clip_region_json {
                if let (Some(local), Some(root)) = (&ir.local, campaign_storage_root) {
                    // Master-app local: generate/use cached crop
                    let abs_path = root.join(local);
                    if abs_path.is_file() {
                        let clip: Option<crate::models::ClipRegion> =
                            serde_json::from_str(clip_json).ok();
                        if let Some(clip) = clip {
                            let cache_path = abs_path.with_extension("token_cache.webp");
                            let needs_regen = !cache_path.is_file() || {
                                let src_meta = std::fs::metadata(&abs_path).ok();
                                let cache_meta = std::fs::metadata(&cache_path).ok();
                                match (src_meta, cache_meta) {
                                    (Some(s), Some(c)) => {
                                        s.modified().ok() > c.modified().ok()
                                    }
                                    _ => true,
                                }
                            };
                            if needs_regen {
                                if let Ok(bytes) = crate::services::image_processing::generate_token_portrait(&abs_path, &clip) {
                                    let _ = std::fs::write(&cache_path, &bytes);
                                }
                            }
                            if cache_path.is_file() {
                                Some(format!("asset://localhost/{}", cache_path.display()))
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                } else if ir.token_portrait_url.is_some() {
                    // Player-activity snapshot: use the relative CloudFront path
                    ir.token_portrait_url.clone()
                } else {
                    None
                }
            } else if campaign_storage_root.is_none() {
                // No clip region, but check if there's a CloudFront URL (for snapshot)
                ir.token_portrait_url.clone()
            } else {
                None
            }
        } else {
            None
        };

        let Some(url) = url else {
            continue;
        };

        let links: Vec<ImageLink> = parse_json(links_json, Vec::new());
        for link in links {
            if link.kind == "character" || link.kind == "npc" {
                entity_portrait_map
                    .entry((link.kind, link.id))
                    .or_insert(url.clone());
            }
        }
    }

    // Map token IDs to portrait URLs
    for token in entity_tokens {
        if let Some(url) = entity_portrait_map.get(&(token.entity_kind.clone(), token.entity_id.clone())) {
            portrait_urls.insert(token.id.clone(), url.clone());
        }
    }

    Ok(portrait_urls)
}

#[tauri::command]
pub async fn build_tabletop_snapshot_json(
    session_id: String,
    active_map_id: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, AppError> {
    let pool = state.pool_for_entity_id(&app, &session_id).await?;

    let session_row: (String,) = sqlx::query_as(
        "SELECT campaign_id FROM sessions WHERE id = ?",
    )
    .bind(&session_id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("session {session_id}")))?;

    let campaign_id = session_row.0;

    // Read campaign name from the campaign JSON file
    let campaign_name: Option<String> = crate::services::campaign_storage::resolve_storage_folder(&app, &campaign_id)
        .and_then(|folder| crate::services::campaign_storage::read_campaign_json(&folder))
        .map(|c| c.name)
        .ok();

    let maps_query = format!("{MAP_SELECT} WHERE campaign_id = ? ORDER BY name COLLATE NOCASE");
    let maps = sqlx::query_as::<_, Map>(&maps_query)
        .bind(&campaign_id)
        .fetch_all(&pool)
        .await?;

    let mut all_tokens: Vec<Token> = Vec::new();
    for map in &maps {
        let query = format!(
            "{TOKEN_SELECT} WHERE map_id = ? AND visible_to_players = 1 AND (entity_kind != 'custom' OR session_id = ?)"
        );
        let rows = sqlx::query_as::<_, TokenRow>(&query)
            .bind(&map.id)
            .bind(&session_id)
            .fetch_all(&pool)
            .await?;
        for row in rows {
            all_tokens.push(Token::from_row(row).map_err(AppError::Internal)?);
        }
    }

    let (token_labels, token_names) =
        build_token_display_maps(&pool, &campaign_id, &all_tokens).await?;

    let token_portrait_urls =
        build_token_portrait_urls(&pool, &campaign_id, &all_tokens, None).await?;

    let active_map_id = active_map_id
        .filter(|id| maps.iter().any(|m| m.id == *id))
        .or_else(|| maps.first().map(|m| m.id.clone()));

    let handout_rows = sqlx::query_as::<_, HandoutRow>(
        r#"
        SELECT id, campaign_id, session_id, label, body,
               image_local_path, image_thumbnail_url, image_canon_url, image_hash,
               visible_to_players, shown_at, created_at, updated_at, version
        FROM handouts
        WHERE session_id = ? AND visible_to_players = 1
        ORDER BY shown_at ASC, created_at ASC
        "#,
    )
    .bind(&session_id)
    .fetch_all(&pool)
    .await?;

    let visible_handouts: Vec<Handout> = handout_rows
        .into_iter()
        .map(Handout::from_row)
        .collect();

    let snapshot_at = now_ms();
    let maps_json: Vec<serde_json::Value> = maps
        .iter()
        .map(|m| serde_json::to_value(m).map_err(|e| AppError::Internal(e.to_string())))
        .collect::<Result<Vec<_>, _>>()?;
    let tokens_json: Vec<serde_json::Value> = all_tokens
        .iter()
        .map(|t| serde_json::to_value(t).map_err(|e| AppError::Internal(e.to_string())))
        .collect::<Result<Vec<_>, _>>()?;
    let handouts_json: Vec<serde_json::Value> = visible_handouts
        .iter()
        .map(|h| serde_json::to_value(h).map_err(|e| AppError::Internal(e.to_string())))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(serde_json::json!({
        "kind": "tabletop.snapshot",
        "sessionId": session_id,
        "activeMapId": active_map_id,
        "campaignName": campaign_name,
        "maps": maps_json,
        "tokens": tokens_json,
        "tokenLabels": token_labels,
        "tokenNames": token_names,
        "tokenPortraitUrls": token_portrait_urls,
        "visibleHandouts": handouts_json,
        "snapshotAt": snapshot_at,
    }))
}

/// Returns token portrait URLs for the master-app tabletop (includes local fallbacks).
#[tauri::command]
pub async fn get_token_portrait_urls(
    campaign_id: String,
    token_ids: Vec<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<HashMap<String, String>, AppError> {
    use crate::services::campaign_storage;

    let pool = state.pool_for_campaign(&app, &campaign_id).await?;
    let campaign_root = campaign_storage::resolve_storage_folder(&app, &campaign_id)?;

    // Load tokens by IDs
    let mut tokens: Vec<Token> = Vec::new();
    for token_id in &token_ids {
        let query = format!("{TOKEN_SELECT} WHERE id = ?");
        if let Some(row) = sqlx::query_as::<_, TokenRow>(&query)
            .bind(token_id)
            .fetch_optional(&pool)
            .await?
        {
            tokens.push(Token::from_row(row).map_err(AppError::Internal)?);
        }
    }

    build_token_portrait_urls(&pool, &campaign_id, &tokens, Some(&campaign_root)).await
}

#[tauri::command]
pub async fn publish_tabletop_snapshot(
    session_id: String,
    active_map_id: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let _snapshot =
        build_tabletop_snapshot_json(session_id, active_map_id, app, state).await?;
    Ok(())
}
