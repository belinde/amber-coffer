use serde::{Deserialize, Serialize};

use super::vault_json::{parse_json, EntityRef};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoreNote {
    pub id: String,
    pub campaign_id: String,
    pub title: String,
    pub kind: String,
    pub body: String,
    pub tags: Vec<String>,
    pub visibility: String,
    pub linked_entities: Vec<EntityRef>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, sqlx::FromRow)]
pub struct LoreNoteRow {
    pub id: String,
    pub campaign_id: String,
    pub title: String,
    pub kind: String,
    pub body: String,
    pub tags_json: String,
    pub visibility: String,
    pub linked_entities_json: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

impl LoreNote {
    pub fn from_row(row: LoreNoteRow) -> Self {
        Self {
            id: row.id,
            campaign_id: row.campaign_id,
            title: row.title,
            kind: row.kind,
            body: row.body,
            tags: parse_json(&row.tags_json, Vec::new()),
            visibility: row.visibility,
            linked_entities: parse_json(&row.linked_entities_json, Vec::new()),
            created_at: row.created_at,
            updated_at: row.updated_at,
            version: row.version,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLoreNoteInput {
    pub campaign_id: String,
    pub title: String,
    #[serde(default = "default_lore_kind")]
    pub kind: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "default_visibility")]
    pub visibility: String,
    #[serde(default)]
    pub linked_entities: Vec<EntityRef>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLoreNoteInput {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub body: String,
    pub tags: Vec<String>,
    pub visibility: String,
    pub linked_entities: Vec<EntityRef>,
}

fn default_lore_kind() -> String {
    "concept".to_string()
}

fn default_visibility() -> String {
    "gm_only".to_string()
}
