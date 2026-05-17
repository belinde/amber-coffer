use serde::{Deserialize, Serialize};

use super::vault_json::{parse_json, EntityRef};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrativeSeed {
    pub id: String,
    pub campaign_id: String,
    pub title: String,
    pub summary: String,
    pub status: String,
    pub body: Option<String>,
    pub tags: Vec<String>,
    pub linked_entities: Vec<EntityRef>,
    pub first_session_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, sqlx::FromRow)]
pub struct NarrativeSeedRow {
    pub id: String,
    pub campaign_id: String,
    pub title: String,
    pub summary: String,
    pub status: String,
    pub body: Option<String>,
    pub tags_json: String,
    pub linked_entities_json: String,
    pub first_session_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

impl NarrativeSeed {
    pub fn from_row(row: NarrativeSeedRow) -> Self {
        Self {
            id: row.id,
            campaign_id: row.campaign_id,
            title: row.title,
            summary: row.summary,
            status: row.status,
            body: row.body,
            tags: parse_json(&row.tags_json, Vec::new()),
            linked_entities: parse_json(&row.linked_entities_json, Vec::new()),
            first_session_id: row.first_session_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
            version: row.version,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNarrativeSeedInput {
    pub campaign_id: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default = "default_seed_status")]
    pub status: String,
    pub body: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub linked_entities: Vec<EntityRef>,
    pub first_session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNarrativeSeedInput {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub status: String,
    pub body: Option<String>,
    pub tags: Vec<String>,
    pub linked_entities: Vec<EntityRef>,
    pub first_session_id: Option<String>,
}

fn default_seed_status() -> String {
    "idea".to_string()
}
