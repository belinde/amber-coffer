use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    pub id: String,
    pub session_id: String,
    pub source_recording_id: Option<String>,
    pub raw_text: Option<String>,
    pub raw_transcript_path: Option<String>,
    pub refined_text: Option<String>,
    pub stt_model: Option<String>,
    pub llm_model: Option<String>,
    pub processed_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}
