use serde::Deserialize;

use super::vault_json::{
    Appearance, EventReference, ImageLink, ImageRef, LinkToCharacter, LocationSection,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPortraitBinding {
    pub entity_kind: String,
    pub entity_id: String,
    pub campaign_image_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportDumpAsset {
    pub entity_kind: String,
    pub entity_id: String,
    pub source_path: String,
    #[serde(rename = "relativeLocal")]
    pub _relative_local: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCharacter {
    pub id: String,
    pub campaign_id: String,
    pub name: String,
    pub player_discord_id: Option<String>,
    pub current_location_id: Option<String>,
    pub species: Option<String>,
    pub role_hint: Option<String>,
    pub appearance: Appearance,
    pub game_stats: serde_json::Value,
    pub game_system_hint: Option<String>,
    pub notable_equipment: Vec<String>,
    pub events_interesting: Vec<EventReference>,
    pub image: Option<ImageRef>,
    pub gm_notes: String,
    pub visibility: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportNpc {
    pub id: String,
    pub campaign_id: String,
    pub name: String,
    pub current_location_id: Option<String>,
    pub faction_id: Option<String>,
    pub species: Option<String>,
    pub role_hint: Option<String>,
    pub region: Option<String>,
    pub scope: Option<String>,
    pub reminder: Option<String>,
    pub record_kind: String,
    pub appearance: Appearance,
    pub game_stats: serde_json::Value,
    pub game_system_hint: Option<String>,
    pub notable_equipment: Vec<String>,
    pub links_to_characters: Vec<LinkToCharacter>,
    pub events_interesting: Vec<EventReference>,
    pub image: Option<ImageRef>,
    pub gm_notes: String,
    pub visibility: String,
    pub status: String,
    pub disposition: Option<String>,
    pub description: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLocation {
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFaction {
    pub id: String,
    pub campaign_id: String,
    pub name: String,
    pub kind: Option<String>,
    pub parent_faction_id: Option<String>,
    pub headquarters_location_id: Option<String>,
    pub goals: String,
    pub secrets: String,
    pub description: Option<String>,
    pub events_interesting: Vec<EventReference>,
    pub image: Option<ImageRef>,
    pub visibility: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLoreNote {
    pub id: String,
    pub campaign_id: String,
    pub title: String,
    pub kind: String,
    pub body: String,
    pub tags: Vec<String>,
    pub visibility: String,
    pub linked_entities: Vec<super::vault_json::EntityRef>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportNarrativeSeed {
    pub id: String,
    pub campaign_id: String,
    pub title: String,
    pub summary: String,
    pub status: String,
    pub body: Option<String>,
    pub tags: Vec<String>,
    pub linked_entities: Vec<super::vault_json::EntityRef>,
    pub first_session_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSession {
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
    pub locations_visited: Vec<String>,
    pub npcs_encountered: Vec<String>,
    pub played_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCampaignImage {
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportDumpEntities {
    pub characters: Vec<ImportCharacter>,
    pub npcs: Vec<ImportNpc>,
    pub locations: Vec<ImportLocation>,
    pub factions: Vec<ImportFaction>,
    pub lore_notes: Vec<ImportLoreNote>,
    pub narrative_seeds: Vec<ImportNarrativeSeed>,
    pub sessions: Vec<ImportSession>,
    pub campaign_images: Vec<ImportCampaignImage>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignImportDump {
    pub version: i32,
    pub campaign_id: String,
    pub entities: ImportDumpEntities,
    pub assets: Vec<ImportDumpAsset>,
    #[serde(default)]
    pub portrait_bindings: Vec<ImportPortraitBinding>,
}
