use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub campaign_id: String,
    pub name: String,
    pub kind: Option<String>,
    pub rarity: Option<String>,
    pub description: Option<String>,
    pub owner_kind: Option<String>,
    pub owner_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateItemInput {
    pub campaign_id: String,
    pub name: String,
    pub kind: Option<String>,
    pub rarity: Option<String>,
    pub description: Option<String>,
    pub owner_kind: Option<String>,
    pub owner_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateItemInput {
    pub id: String,
    pub name: String,
    pub kind: Option<String>,
    pub rarity: Option<String>,
    pub description: Option<String>,
    pub owner_kind: Option<String>,
    pub owner_id: Option<String>,
}
