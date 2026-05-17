use tauri::State;

use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::models::{Token, TokenPosition, TokenRow};
use crate::util::now_ms;

const TOKEN_SELECT: &str = r#"
        SELECT id, map_id, entity_kind, entity_id, zone, x_cell, y_cell, bench_slot,
               visible_to_players, created_at, updated_at, version
        FROM tokens
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
pub async fn list_tokens(map_id: String, state: State<'_, AppState>) -> Result<Vec<Token>, AppError> {
    let query = format!("{TOKEN_SELECT} WHERE map_id = ? ORDER BY created_at");
    let rows = sqlx::query_as::<_, TokenRow>(&query)
        .bind(&map_id)
        .fetch_all(state.pool())
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
    state: State<'_, AppState>,
) -> Result<Token, AppError> {
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
    .execute(state.pool())
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("token {token_id}")));
    }

    let query = format!("{TOKEN_SELECT} WHERE id = ?");
    let row = sqlx::query_as::<_, TokenRow>(&query)
        .bind(&token_id)
        .fetch_optional(state.pool())
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
    _token_id: String,
    _accepted: bool,
    _final_position_json: Option<serde_json::Value>,
) -> Result<serde_json::Value, AppError> {
    Err(AppError::NotImplemented("resolve_token_move_request".into()))
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
pub async fn publish_tabletop_snapshot(_session_id: String) -> Result<(), AppError> {
    Err(AppError::NotImplemented("publish_tabletop_snapshot".into()))
}
