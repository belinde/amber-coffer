use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Relationship {
    pub id: String,
    pub campaign_id: String,
    pub from_kind: String,
    pub from_id: String,
    pub to_kind: String,
    pub to_id: String,
    pub relation_type: String,
    pub strength: i32,
    pub bidirectional: bool,
    pub description: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, sqlx::FromRow)]
pub struct RelationshipRow {
    pub id: String,
    pub campaign_id: String,
    pub from_kind: String,
    pub from_id: String,
    pub to_kind: String,
    pub to_id: String,
    pub relation_type: String,
    pub strength: i32,
    pub bidirectional: i32,
    pub description: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

impl Relationship {
    pub fn from_row(row: RelationshipRow) -> Self {
        Self {
            id: row.id,
            campaign_id: row.campaign_id,
            from_kind: row.from_kind,
            from_id: row.from_id,
            to_kind: row.to_kind,
            to_id: row.to_id,
            relation_type: row.relation_type,
            strength: row.strength,
            bidirectional: row.bidirectional != 0,
            description: row.description,
            created_at: row.created_at,
            updated_at: row.updated_at,
            version: row.version,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRelationshipInput {
    pub campaign_id: String,
    pub from_kind: String,
    pub from_id: String,
    pub to_kind: String,
    pub to_id: String,
    pub relation_type: String,
    #[serde(default)]
    pub strength: i32,
    #[serde(default)]
    pub bidirectional: bool,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRelationshipInput {
    pub id: String,
    pub from_kind: String,
    pub from_id: String,
    pub to_kind: String,
    pub to_id: String,
    pub relation_type: String,
    pub strength: i32,
    pub bidirectional: bool,
    pub description: Option<String>,
}
