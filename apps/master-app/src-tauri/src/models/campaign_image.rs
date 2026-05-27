use serde::{Deserialize, Serialize};

use super::vault_json::{parse_json, parse_json_opt, ImageLink, ImageRef};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignImage {
    pub id: String,
    pub campaign_id: String,
    pub title: String,
    pub caption: String,
    pub image: Option<ImageRef>,
    pub links: Vec<ImageLink>,
    pub visibility: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, sqlx::FromRow)]
pub struct CampaignImageRow {
    pub id: String,
    pub campaign_id: String,
    pub title: String,
    pub caption: String,
    pub image_ref_json: Option<String>,
    pub visibility: String,
    pub links_json: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

impl CampaignImage {
    pub fn from_row(row: CampaignImageRow) -> Self {
        Self {
            id: row.id,
            campaign_id: row.campaign_id,
            title: row.title,
            caption: row.caption,
            image: parse_json_opt(row.image_ref_json.as_deref()),
            links: parse_json(&row.links_json, Vec::new()),
            visibility: row.visibility,
            created_at: row.created_at,
            updated_at: row.updated_at,
            version: row.version,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCampaignImageInput {
    pub campaign_id: String,
    pub title: String,
    #[serde(default)]
    pub caption: String,
    pub visibility: String,
    #[serde(default)]
    pub links: Vec<ImageLink>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCampaignImageInput {
    pub id: String,
    pub title: String,
    pub caption: String,
    pub visibility: String,
    pub links: Vec<ImageLink>,
}

/// Lightweight entry for the map background image picker UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignImagePickerEntry {
    pub id: String,
    pub title: String,
    pub thumbnail_path: Option<String>,
    pub width_px: Option<u32>,
    pub height_px: Option<u32>,
    pub link_kinds: Vec<String>,
}
