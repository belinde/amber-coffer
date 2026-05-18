use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::services::discord_setup::{
    self, application_id_from_bot_token, DiscordOAuthState, DiscordGuildOption,
    DiscordVoiceChannelOption,
};

#[tauri::command]
pub async fn discord_oauth_start(
    app: AppHandle,
    oauth: State<'_, Arc<DiscordOAuthState>>,
) -> Result<(), AppError> {
    discord_setup::oauth_start(&app, oauth.inner()).await
}

#[tauri::command]
pub fn discord_oauth_clear(oauth: State<'_, Arc<DiscordOAuthState>>) -> Result<(), AppError> {
    oauth.clear_session();
    Ok(())
}

#[tauri::command]
pub async fn discord_list_admin_guilds(
    app: AppHandle,
    oauth: State<'_, Arc<DiscordOAuthState>>,
) -> Result<Vec<DiscordGuildOption>, AppError> {
    discord_setup::list_admin_guilds_with_bot(&app, oauth.inner()).await
}

#[tauri::command]
pub fn discord_open_bot_invite(app: AppHandle, guild_id: String) -> Result<(), AppError> {
    discord_setup::open_bot_invite(&app, &guild_id)
}

#[tauri::command]
pub async fn discord_is_bot_in_guild(app: AppHandle, guild_id: String) -> Result<bool, AppError> {
    discord_setup::is_bot_in_guild(&app, &guild_id).await
}

#[tauri::command]
pub async fn discord_list_voice_channels(
    app: AppHandle,
    guild_id: String,
) -> Result<Vec<DiscordVoiceChannelOption>, AppError> {
    discord_setup::list_voice_channels(&app, &guild_id).await
}

#[tauri::command]
pub fn discord_parse_bot_application_id(token: String) -> Result<String, AppError> {
    application_id_from_bot_token(&token)
}
