use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub campaign_id: String,
    pub number: i32,
    pub title: Option<String>,
    pub status: String,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub summary: String,
    pub events_body: String,
    pub gm_notes: String,
    pub public_summary: Option<String>,
    pub locations_visited_json: String,
    pub npcs_encountered_json: String,
    pub played_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionInput {
    pub campaign_id: String,
    pub number: Option<i32>,
    pub title: Option<String>,
    pub status: Option<String>,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub summary: Option<String>,
    pub events_body: Option<String>,
    pub gm_notes: Option<String>,
    pub public_summary: Option<String>,
    pub locations_visited_json: Option<String>,
    pub npcs_encountered_json: Option<String>,
    pub played_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSessionInput {
    pub id: String,
    pub number: i32,
    pub title: Option<String>,
    pub status: String,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub summary: Option<String>,
    pub events_body: Option<String>,
    pub gm_notes: Option<String>,
    pub public_summary: Option<String>,
    pub locations_visited_json: Option<String>,
    pub npcs_encountered_json: Option<String>,
    pub played_at: Option<i64>,
}
