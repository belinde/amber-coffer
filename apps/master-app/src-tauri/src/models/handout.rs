use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct HandoutRow {
    pub id: String,
    pub campaign_id: String,
    pub session_id: String,
    pub label: String,
    pub body: Option<String>,
    pub image_local_path: Option<String>,
    pub image_thumbnail_url: Option<String>,
    pub image_canon_url: Option<String>,
    pub image_hash: Option<String>,
    pub visible_to_players: i32,
    pub shown_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoutImageJson {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canon_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Handout {
    pub id: String,
    pub campaign_id: String,
    pub session_id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<HandoutImageJson>,
    pub visible_to_players: bool,
    pub shown_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

impl Handout {
    pub fn from_row(row: HandoutRow) -> Self {
        let image = if row.image_local_path.is_some()
            || row.image_thumbnail_url.is_some()
            || row.image_canon_url.is_some()
            || row.image_hash.is_some()
        {
            Some(HandoutImageJson {
                local_path: row.image_local_path,
                thumbnail_url: row.image_thumbnail_url,
                canon_url: row.image_canon_url,
                hash: row.image_hash,
            })
        } else {
            None
        };

        Self {
            id: row.id,
            campaign_id: row.campaign_id,
            session_id: row.session_id,
            label: row.label,
            body: row.body,
            image,
            visible_to_players: row.visible_to_players != 0,
            shown_at: row.shown_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
            version: row.version,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareImageAsHandoutInput {
    pub session_id: String,
    pub label: String,
    pub session_token: String,
    pub sync_api_base_url: String,
    pub campaign_id: String,
    #[serde(default)]
    pub local_path: Option<String>,
    #[serde(default)]
    pub absolute_source_path: Option<String>,
    #[serde(default)]
    pub campaign_image_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMapBackgroundInput {
    pub map_id: String,
    pub session_id: String,
    pub session_token: String,
    pub sync_api_base_url: String,
    pub campaign_id: String,
    #[serde(default)]
    pub local_path: Option<String>,
    #[serde(default)]
    pub absolute_source_path: Option<String>,
    #[serde(default)]
    pub campaign_image_id: Option<String>,
}
