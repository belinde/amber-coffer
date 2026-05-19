use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::db::AppState;
use crate::error::AppError;
use crate::models::{normalize_play_language, Campaign, CreateCampaignInput, UpdateCampaignInput};
use crate::services::campaign_storage;
use crate::services::discord_setup;
use crate::util::{now_ms, slugify};
use crate::validation_issue::required_field;

pub const POC_CAMPAIGN_NAME: &str = "La corsa al Nuovo Mondo";
pub const POC_CAMPAIGN_DESCRIPTION: &str =
    "Dove la Frontiera finisce, comincia il Nuovo Mondo.";

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsurePocCampaignResult {
    pub campaign_id: String,
    pub created: bool,
}

pub async fn find_or_create_campaign_by_name(
    name: &str,
    description: Option<String>,
    catchphrase: Option<String>,
    preferred_id: Option<&str>,
    app: &AppHandle,
    state: &AppState,
) -> Result<(Campaign, bool), AppError> {
    if let Some(existing) = campaign_storage::find_campaign_by_name(app, name)? {
        state.refresh_index(app)?;
        return Ok((existing, false));
    }

    let input = CreateCampaignInput {
        name: name.to_string(),
        description,
        catchphrase,
        play_language: "it".to_string(),
        discord_channel_id: None,
        discord_guild_id: None,
        discord_guild_name: None,
        discord_channel_name: None,
    };
    let campaign = create_campaign_inner(input, preferred_id, app, state).await?;
    Ok((campaign, true))
}

async fn create_campaign_inner(
    input: CreateCampaignInput,
    preferred_id: Option<&str>,
    app: &AppHandle,
    state: &AppState,
) -> Result<Campaign, AppError> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(required_field(&["name"]));
    }

    let id = preferred_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::now_v7().to_string());
    let now = now_ms();
    let base_slug = slugify(name);
    let slug = campaign_storage::unique_campaign_slug(app, &base_slug)?;

    let (folder, storage_uuid) = campaign_storage::create_storage_folder(app)?;

    let play_language = normalize_play_language(&input.play_language)
        .map_err(|msg| AppError::Internal(msg))?;

    let campaign = Campaign {
        id: id.clone(),
        name: name.to_string(),
        slug,
        description: input.description,
        catchphrase: input.catchphrase,
        play_language,
        discord_channel_id: input.discord_channel_id,
        discord_guild_id: input.discord_guild_id,
        discord_guild_name: input.discord_guild_name,
        discord_channel_name: input.discord_channel_name,
        created_at: now,
        updated_at: now,
        version: 1,
    };

    campaign_storage::write_campaign_json(&folder, &campaign)?;

    let db_path = campaign_storage::database_path(&folder);
    let path_str = db_path
        .to_str()
        .ok_or_else(|| AppError::Internal("invalid database path".into()))?;
    crate::db::init_pool(path_str).await?;

    state.register_campaign(&id, &storage_uuid);

    Ok(campaign)
}

#[tauri::command]
pub async fn ensure_poc_campaign(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<EnsurePocCampaignResult, AppError> {
    let (campaign, created) = find_or_create_campaign_by_name(
        POC_CAMPAIGN_NAME,
        None,
        Some(POC_CAMPAIGN_DESCRIPTION.to_string()),
        None,
        &app,
        &state,
    )
    .await?;
    Ok(EnsurePocCampaignResult {
        campaign_id: campaign.id,
        created,
    })
}

#[tauri::command]
pub async fn list_campaigns(app: AppHandle) -> Result<Vec<Campaign>, AppError> {
    campaign_storage::list_campaigns(&app)
}

#[tauri::command]
pub async fn get_campaign(id: String, app: AppHandle) -> Result<Option<Campaign>, AppError> {
    let folder = match campaign_storage::resolve_storage_folder(&app, &id) {
        Ok(f) => f,
        Err(AppError::NotFound(_)) => return Ok(None),
        Err(e) => return Err(e),
    };
    Ok(Some(campaign_storage::read_campaign_json(&folder)?))
}

#[tauri::command]
pub async fn create_campaign(
    input: CreateCampaignInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Campaign, AppError> {
    create_campaign_inner(input, None, &app, &state).await
}

#[tauri::command]
pub async fn update_campaign(
    input: UpdateCampaignInput,
    app: AppHandle,
) -> Result<Campaign, AppError> {
    let folder = campaign_storage::resolve_storage_folder(&app, &input.id)?;
    let mut campaign = campaign_storage::read_campaign_json(&folder)?;

    let now = now_ms();

    if let Some(ref raw_name) = input.name {
        let name = raw_name.trim();
        if name.is_empty() {
            return Err(required_field(&["name"]));
        }
        if name != campaign.name {
            campaign.name = name.to_string();
            let base_slug = slugify(name);
            campaign.slug = campaign_storage::unique_campaign_slug_excluding(
                &app,
                &base_slug,
                Some(&campaign.id),
            )?;
        }
    }

    if let Some(catch_opt) = &input.catchphrase {
        campaign.catchphrase = catch_opt
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
    }

    if let Some(channel_opt) = &input.discord_channel_id {
        campaign.discord_channel_id = channel_opt
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        if campaign.discord_channel_id.is_none() {
            campaign.discord_channel_name = None;
        }
    }
    if let Some(guild_opt) = &input.discord_guild_id {
        campaign.discord_guild_id = guild_opt
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        if campaign.discord_guild_id.is_none() {
            campaign.discord_guild_name = None;
        }
    }
    if let Some(name_opt) = &input.discord_guild_name {
        campaign.discord_guild_name = name_opt
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
    }
    if let Some(name_opt) = &input.discord_channel_name {
        campaign.discord_channel_name = name_opt
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
    }
    if let Some(ref lang) = input.play_language {
        campaign.play_language = normalize_play_language(lang).map_err(|msg| AppError::Internal(msg))?;
    }

    if campaign.discord_guild_id.is_none() {
        if let Some(ref channel_id) = campaign.discord_channel_id {
            if let Ok(Some(guild_id)) =
                discord_setup::resolve_guild_id_from_channel(&app, channel_id).await
            {
                campaign.discord_guild_id = Some(guild_id);
            }
        }
    }

    campaign.updated_at = now;
    campaign.version += 1;

    campaign_storage::write_campaign_json(&folder, &campaign)?;
    Ok(campaign)
}

#[cfg(test)]
mod tests {
    use super::slugify;

    #[test]
    fn slugify_strips_punctuation() {
        assert_eq!(slugify("La corsa al Nuovo Mondo!"), "la-corsa-al-nuovo-mondo");
    }
}
