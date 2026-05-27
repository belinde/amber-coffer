use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VisualReference {
    #[serde(default)]
    pub prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Appearance {
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub personality: String,
    #[serde(default)]
    pub permanent_marks: Vec<String>,
    #[serde(default)]
    pub visual_reference: VisualReference,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventReference {
    pub session_id: String,
    pub summary: String,
    pub occurred_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImageRef {
    pub local: Option<String>,
    pub hash: Option<String>,
    pub thumbnail_url: Option<String>,
    pub canon_url: Option<String>,
    pub token_portrait_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkToCharacter {
    pub character_id: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationSection {
    pub title: String,
    #[serde(default)]
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityRef {
    pub kind: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageLink {
    pub kind: String,
    pub id: String,
}

pub fn parse_json<T: for<'de> Deserialize<'de>>(raw: &str, default: T) -> T {
    serde_json::from_str(raw).unwrap_or(default)
}

pub fn parse_json_opt<T: for<'de> Deserialize<'de>>(raw: Option<&str>) -> Option<T> {
    raw.and_then(|s| serde_json::from_str(s).ok())
}
