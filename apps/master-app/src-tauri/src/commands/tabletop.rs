use tauri::{AppHandle, State};

use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::{Map, Token, TokenPosition, TokenRow};
use crate::util::now_ms;

const TOKEN_SELECT: &str = r#"
        SELECT id, map_id, entity_kind, entity_id, zone, x_cell, y_cell, bench_slot,
               visible_to_players, controlled_by_discord_id, created_at, updated_at, version
        FROM tokens
"#;

const MAP_SELECT: &str = r#"
        SELECT id, campaign_id, name, image_path, width_px, height_px, grid_size_px,
               grid_cols, grid_rows, bench_slots, created_at, updated_at, version
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

#[tauri::command]
pub async fn list_tokens(
    map_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<Token>, AppError> {
    let pool = state.pool_for_entity_id(&app, &map_id).await?;
    let query = format!("{TOKEN_SELECT} WHERE map_id = ? ORDER BY created_at");
    let rows = sqlx::query_as::<_, TokenRow>(&query)
        .bind(&map_id)
        .fetch_all(&pool)
        .await?;

    rows.into_iter()
        .map(|row| {
            Token::from_row(row).map_err(|e| AppError::Internal(e))
        })
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

    let query = format!("{TOKEN_SELECT} WHERE id = ?");
    let row = sqlx::query_as::<_, TokenRow>(&query)
        .bind(&token_id)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("token {token_id}")))?;

    Token::from_row(row).map_err(|e| AppError::Internal(e))
}

/// Place a new token on a map. Stub — business logic not implemented yet.
#[tauri::command]
pub async fn place_token(
    _map_id: String,
    _entity_kind: String,
    _entity_id: String,
    _position_json: serde_json::Value,
) -> Result<serde_json::Value, AppError> {
    Err(AppError::NotImplemented("place_token".into()))
}

#[tauri::command]
pub async fn resolve_token_move_request(
    token_id: String,
    accepted: bool,
    final_position_json: Option<serde_json::Value>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, AppError> {
    if !accepted {
        return Ok(serde_json::json!({ "accepted": false }));
    }
    let position = final_position_json.ok_or_else(|| {
        AppError::Internal("final position required when accepting move".into())
    })?;
    let token = move_token(token_id, position, app, state).await?;
    Ok(serde_json::to_value(token).map_err(|e| AppError::Internal(e.to_string()))?)
}

#[tauri::command]
pub async fn remove_token(_token_id: String) -> Result<(), AppError> {
    Err(AppError::NotImplemented("remove_token".into()))
}

#[tauri::command]
pub async fn share_handout(_handout_id: String) -> Result<serde_json::Value, AppError> {
    Err(AppError::NotImplemented("share_handout".into()))
}

#[tauri::command]
pub async fn hide_handout(_handout_id: String) -> Result<(), AppError> {
    Err(AppError::NotImplemented("hide_handout".into()))
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

    let maps_query = format!("{MAP_SELECT} WHERE campaign_id = ? ORDER BY name COLLATE NOCASE");
    let maps = sqlx::query_as::<_, Map>(&maps_query)
        .bind(&campaign_id)
        .fetch_all(&pool)
        .await?;

    let mut all_tokens: Vec<Token> = Vec::new();
    for map in &maps {
        let query = format!("{TOKEN_SELECT} WHERE map_id = ? AND visible_to_players = 1");
        let rows = sqlx::query_as::<_, TokenRow>(&query)
            .bind(&map.id)
            .fetch_all(&pool)
            .await?;
        for row in rows {
            all_tokens.push(Token::from_row(row).map_err(AppError::Internal)?);
        }
    }

    let active_map_id = active_map_id
        .filter(|id| maps.iter().any(|m| m.id == *id))
        .or_else(|| maps.first().map(|m| m.id.clone()));

    let snapshot_at = now_ms();
    let maps_json: Vec<serde_json::Value> = maps
        .iter()
        .map(|m| serde_json::to_value(m).map_err(|e| AppError::Internal(e.to_string())))
        .collect::<Result<Vec<_>, _>>()?;
    let tokens_json: Vec<serde_json::Value> = all_tokens
        .iter()
        .map(|t| serde_json::to_value(t).map_err(|e| AppError::Internal(e.to_string())))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(serde_json::json!({
        "kind": "tabletop.snapshot",
        "sessionId": session_id,
        "activeMapId": active_map_id,
        "maps": maps_json,
        "tokens": tokens_json,
        "visibleHandouts": [],
        "snapshotAt": snapshot_at,
    }))
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
