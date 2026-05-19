use serde::{Deserialize, Serialize};
use sqlx::FromRow;

fn default_play_language() -> String {
    "it".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Campaign {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    #[serde(default)]
    pub catchphrase: Option<String>,
    #[serde(default = "default_play_language")]
    pub play_language: String,
    pub discord_channel_id: Option<String>,
    #[serde(default)]
    pub discord_guild_id: Option<String>,
    #[serde(default)]
    pub discord_guild_name: Option<String>,
    #[serde(default)]
    pub discord_channel_name: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCampaignInput {
    pub name: String,
    pub description: Option<String>,
    #[serde(default)]
    pub catchphrase: Option<String>,
    #[serde(default = "default_play_language")]
    pub play_language: String,
    pub discord_channel_id: Option<String>,
    #[serde(default)]
    pub discord_guild_id: Option<String>,
    #[serde(default)]
    pub discord_guild_name: Option<String>,
    #[serde(default)]
    pub discord_channel_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCampaignInput {
    pub id: String,
    pub name: Option<String>,
    /// `None` = omitted; inner `None` = clear catchphrase.
    pub catchphrase: Option<Option<String>>,
    /// `None` = field omitted (no change); inner `None` = clear channel.
    pub discord_channel_id: Option<Option<String>>,
    /// `None` = field omitted (no change); inner `None` = clear guild.
    pub discord_guild_id: Option<Option<String>>,
    pub discord_guild_name: Option<Option<String>>,
    pub discord_channel_name: Option<Option<String>>,
    pub play_language: Option<String>,
}

const PLAY_LANGUAGES: [&str; 4] = ["it", "en", "fr", "es"];

pub fn normalize_play_language(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if PLAY_LANGUAGES.contains(&trimmed) {
        return Ok(trimmed.to_string());
    }
    Err(format!(
        "playLanguage must be one of: {}",
        PLAY_LANGUAGES.join(", ")
    ))
}
