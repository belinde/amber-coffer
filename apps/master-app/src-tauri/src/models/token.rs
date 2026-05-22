use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TokenRow {
    pub id: String,
    pub map_id: String,
    pub entity_kind: String,
    pub entity_id: String,
    pub session_id: Option<String>,
    pub display_name: Option<String>,
    pub zone: String,
    pub x_cell: Option<i32>,
    pub y_cell: Option<i32>,
    pub bench_slot: Option<i32>,
    pub visible_to_players: i32,
    pub controlled_by_discord_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenPosition {
    pub zone: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x_cell: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y_cell: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slot: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Token {
    pub id: String,
    pub map_id: String,
    pub entity_kind: String,
    pub entity_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    pub position: TokenPosition,
    pub visible_to_players: bool,
    pub controlled_by_player_discord_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

pub fn normalize_optional_discord_id(id: Option<String>) -> Option<String> {
    id.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

impl Token {
    pub fn from_row(row: TokenRow) -> Result<Self, String> {
        let position = match row.zone.as_str() {
            "board" => TokenPosition {
                zone: "board".into(),
                x_cell: row.x_cell,
                y_cell: row.y_cell,
                slot: None,
            },
            "bench" => TokenPosition {
                zone: "bench".into(),
                x_cell: None,
                y_cell: None,
                slot: row.bench_slot,
            },
            other => return Err(format!("invalid token zone: {other}")),
        };
        Ok(Token {
            id: row.id,
            map_id: row.map_id,
            entity_kind: row.entity_kind,
            entity_id: row.entity_id,
            session_id: row.session_id,
            display_name: row.display_name,
            position,
            visible_to_players: row.visible_to_players != 0,
            controlled_by_player_discord_id: normalize_optional_discord_id(row.controlled_by_discord_id),
            created_at: row.created_at,
            updated_at: row.updated_at,
            version: row.version,
        })
    }
}
