use serde::{Deserialize, Serialize};

use super::vault_json::{
    parse_json, parse_json_opt, Appearance, EventReference, ImageRef, LocationSection,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    pub id: String,
    pub campaign_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub region: Option<String>,
    pub kind: Option<String>,
    pub population: Option<String>,
    pub appearance: Appearance,
    pub sections: Vec<LocationSection>,
    pub events_interesting: Vec<EventReference>,
    pub image: Option<ImageRef>,
    pub visibility: String,
    pub description: Option<String>,
    pub coordinates: Option<serde_json::Value>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, sqlx::FromRow)]
pub struct LocationRow {
    pub id: String,
    pub campaign_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub region: Option<String>,
    pub kind: Option<String>,
    pub population: Option<String>,
    pub visibility: String,
    pub appearance_json: String,
    pub sections_json: String,
    pub events_interesting_json: String,
    pub image_ref_json: Option<String>,
    pub description: Option<String>,
    pub coordinates_json: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

impl Location {
    pub fn from_row(row: LocationRow) -> Self {
        let coordinates = row
            .coordinates_json
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok());
        Self {
            id: row.id,
            campaign_id: row.campaign_id,
            parent_id: row.parent_id,
            name: row.name,
            region: row.region,
            kind: row.kind,
            population: row.population,
            appearance: parse_json(&row.appearance_json, Appearance::default()),
            sections: parse_json(&row.sections_json, Vec::new()),
            events_interesting: parse_json(&row.events_interesting_json, Vec::new()),
            image: parse_json_opt(row.image_ref_json.as_deref()),
            visibility: row.visibility,
            description: row.description,
            coordinates,
            created_at: row.created_at,
            updated_at: row.updated_at,
            version: row.version,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLocationInput {
    pub campaign_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub region: Option<String>,
    pub kind: Option<String>,
    pub population: Option<String>,
    #[serde(default)]
    pub appearance: Appearance,
    #[serde(default)]
    pub sections: Vec<LocationSection>,
    #[serde(default)]
    pub events_interesting: Vec<EventReference>,
    pub image: Option<ImageRef>,
    #[serde(default = "default_visibility")]
    pub visibility: String,
    pub description: Option<String>,
    pub coordinates: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLocationInput {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub region: Option<String>,
    pub kind: Option<String>,
    pub population: Option<String>,
    pub appearance: Appearance,
    pub sections: Vec<LocationSection>,
    pub events_interesting: Vec<EventReference>,
    pub image: Option<ImageRef>,
    pub visibility: String,
    pub description: Option<String>,
    pub coordinates: Option<serde_json::Value>,
}

fn default_visibility() -> String {
    "gm_only".to_string()
}
