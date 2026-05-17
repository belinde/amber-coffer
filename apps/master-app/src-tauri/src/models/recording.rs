use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Recording {
    pub id: String,
    pub session_id: String,
    pub user_discord_id: String,
    pub source_kind: String,
    pub file_path: String,
    pub duration_ms: Option<i64>,
    pub sample_rate: Option<i32>,
    pub channels: Option<i32>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}
