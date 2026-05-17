use serde::{Deserialize, Serialize};

use super::vault_json::{parse_json, parse_json_opt, EventReference, ImageRef};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Faction {
    pub id: String,
    pub campaign_id: String,
    pub name: String,
    pub kind: Option<String>,
    pub parent_faction_id: Option<String>,
    pub headquarters_location_id: Option<String>,
    pub goals: String,
    pub secrets: String,
    pub description: Option<String>,
    pub events_interesting: Vec<EventReference>,
    pub image: Option<ImageRef>,
    pub visibility: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, sqlx::FromRow)]
pub struct FactionRow {
    pub id: String,
    pub campaign_id: String,
    pub name: String,
    pub faction_kind: Option<String>,
    pub parent_faction_id: Option<String>,
    pub headquarters_location_id: Option<String>,
    pub goals: String,
    pub secrets: String,
    pub description: Option<String>,
    pub events_interesting_json: String,
    pub image_ref_json: Option<String>,
    pub visibility: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

impl Faction {
    pub fn from_row(row: FactionRow) -> Self {
        Self {
            id: row.id,
            campaign_id: row.campaign_id,
            name: row.name,
            kind: row.faction_kind,
            parent_faction_id: row.parent_faction_id,
            headquarters_location_id: row.headquarters_location_id,
            goals: row.goals,
            secrets: row.secrets,
            description: row.description,
            events_interesting: parse_json(&row.events_interesting_json, Vec::new()),
            image: parse_json_opt(row.image_ref_json.as_deref()),
            visibility: row.visibility,
            created_at: row.created_at,
            updated_at: row.updated_at,
            version: row.version,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFactionInput {
    pub campaign_id: String,
    pub name: String,
    pub kind: Option<String>,
    pub parent_faction_id: Option<String>,
    pub headquarters_location_id: Option<String>,
    #[serde(default)]
    pub goals: String,
    #[serde(default)]
    pub secrets: String,
    pub description: Option<String>,
    #[serde(default)]
    pub events_interesting: Vec<EventReference>,
    pub image: Option<ImageRef>,
    #[serde(default = "default_visibility")]
    pub visibility: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFactionInput {
    pub id: String,
    pub name: String,
    pub kind: Option<String>,
    pub parent_faction_id: Option<String>,
    pub headquarters_location_id: Option<String>,
    pub goals: String,
    pub secrets: String,
    pub description: Option<String>,
    pub events_interesting: Vec<EventReference>,
    pub image: Option<ImageRef>,
    pub visibility: String,
}

fn default_visibility() -> String {
    "gm_only".to_string()
}
