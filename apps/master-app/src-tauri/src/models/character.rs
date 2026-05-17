use serde::{Deserialize, Serialize};

use super::vault_json::{
    parse_json, parse_json_opt, Appearance, EventReference, ImageRef,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Character {
    pub id: String,
    pub campaign_id: String,
    pub name: String,
    pub player_discord_id: Option<String>,
    pub current_location_id: Option<String>,
    pub species: Option<String>,
    pub role_hint: Option<String>,
    pub appearance: Appearance,
    pub game_stats: serde_json::Value,
    pub game_system_hint: Option<String>,
    pub notable_equipment: Vec<String>,
    pub events_interesting: Vec<EventReference>,
    pub image: Option<ImageRef>,
    pub gm_notes: String,
    pub visibility: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, sqlx::FromRow)]
pub struct CharacterRow {
    pub id: String,
    pub campaign_id: String,
    pub name: String,
    pub player_discord_id: Option<String>,
    pub current_location_id: Option<String>,
    pub species: Option<String>,
    pub role_hint: Option<String>,
    pub game_system_hint: Option<String>,
    pub gm_notes: String,
    pub visibility: String,
    pub appearance_json: String,
    pub game_stats_json: String,
    pub notable_equipment_json: String,
    pub events_interesting_json: String,
    pub image_ref_json: Option<String>,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

impl Character {
    pub fn from_row(row: CharacterRow) -> Self {
        Self {
            id: row.id,
            campaign_id: row.campaign_id,
            name: row.name,
            player_discord_id: row.player_discord_id,
            current_location_id: row.current_location_id,
            species: row.species,
            role_hint: row.role_hint,
            appearance: parse_json(&row.appearance_json, Appearance::default()),
            game_stats: parse_json(&row.game_stats_json, serde_json::json!({})),
            game_system_hint: row.game_system_hint,
            notable_equipment: parse_json(&row.notable_equipment_json, Vec::new()),
            events_interesting: parse_json(&row.events_interesting_json, Vec::new()),
            image: parse_json_opt(row.image_ref_json.as_deref()),
            gm_notes: row.gm_notes,
            visibility: row.visibility,
            status: row.status,
            created_at: row.created_at,
            updated_at: row.updated_at,
            version: row.version,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCharacterInput {
    pub campaign_id: String,
    pub name: String,
    pub player_discord_id: Option<String>,
    pub current_location_id: Option<String>,
    pub species: Option<String>,
    pub role_hint: Option<String>,
    #[serde(default)]
    pub appearance: Appearance,
    #[serde(default)]
    pub game_stats: serde_json::Value,
    pub game_system_hint: Option<String>,
    #[serde(default)]
    pub notable_equipment: Vec<String>,
    #[serde(default)]
    pub events_interesting: Vec<EventReference>,
    pub image: Option<ImageRef>,
    #[serde(default)]
    pub gm_notes: String,
    #[serde(default = "default_visibility")]
    pub visibility: String,
    #[serde(default = "default_character_status")]
    pub status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCharacterInput {
    pub id: String,
    pub name: String,
    pub player_discord_id: Option<String>,
    pub current_location_id: Option<String>,
    pub species: Option<String>,
    pub role_hint: Option<String>,
    pub appearance: Appearance,
    pub game_stats: serde_json::Value,
    pub game_system_hint: Option<String>,
    pub notable_equipment: Vec<String>,
    pub events_interesting: Vec<EventReference>,
    pub image: Option<ImageRef>,
    pub gm_notes: String,
    pub visibility: String,
    pub status: String,
}

fn default_character_status() -> String {
    "active".to_string()
}

fn default_visibility() -> String {
    "gm_only".to_string()
}
