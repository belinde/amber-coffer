use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Map {
    pub id: String,
    pub campaign_id: String,
    pub name: String,
    pub image_path: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub background_public_path: String,
    pub width_px: i32,
    pub height_px: i32,
    pub grid_size_px: i32,
    pub grid_cols: i32,
    pub grid_rows: i32,
    pub bench_slots: i32,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMapInput {
    pub campaign_id: String,
    pub name: Option<String>,
}
