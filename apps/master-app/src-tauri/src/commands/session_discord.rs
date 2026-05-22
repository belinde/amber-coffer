use serde::Deserialize;
use tauri::{AppHandle, State};

use crate::db::AppState;
use crate::error::AppError;
use crate::services::session_discord::{
    self, SessionDiscordAssignmentView, SessionDiscordParticipantView,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertSessionDiscordAssignmentInput {
    pub session_id: String,
    pub discord_user_id: String,
    pub discord_display_name: Option<String>,
    pub participant_role: Option<String>,
    pub character_id: Option<String>,
    pub is_primary: Option<bool>,
}

#[tauri::command]
pub async fn list_session_discord_participants(
    session_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<SessionDiscordParticipantView>, AppError> {
    let pool = state.pool_for_entity_id(&app, &session_id).await?;
    let session = crate::services::discord_recording::load_session(&pool, &session_id).await?;
    let pool = state.pool_for_campaign(&app, &session.campaign_id).await?;
    session_discord::list_participants(&pool, &session.campaign_id, &session_id).await
}

#[tauri::command]
pub async fn upsert_session_discord_assignment(
    input: UpsertSessionDiscordAssignmentInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SessionDiscordAssignmentView, AppError> {
    let pool = state.pool_for_entity_id(&app, &input.session_id).await?;
    let session =
        crate::services::discord_recording::load_session(&pool, &input.session_id).await?;
    let pool = state.pool_for_campaign(&app, &session.campaign_id).await?;
    let char_patch = if input.character_id.is_some() || input.is_primary == Some(true) {
        Some(
            input
                .character_id
                .as_deref()
                .filter(|id| !id.is_empty()),
        )
    } else {
        None
    };
    session_discord::upsert_assignment(
        &pool,
        &session.campaign_id,
        &input.session_id,
        &input.discord_user_id,
        input.discord_display_name.as_deref(),
        input.participant_role.as_deref(),
        char_patch,
        input.is_primary,
    )
    .await
}

#[tauri::command]
pub async fn remove_session_discord_assignment(
    assignment_id: String,
    session_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let pool = state.pool_for_entity_id(&app, &session_id).await?;
    let session = crate::services::discord_recording::load_session(&pool, &session_id).await?;
    let pool = state.pool_for_campaign(&app, &session.campaign_id).await?;
    session_discord::remove_assignment(&pool, &assignment_id).await
}

#[tauri::command]
pub async fn add_session_shared_account_character(
    session_id: String,
    discord_user_id: String,
    character_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SessionDiscordAssignmentView, AppError> {
    let pool = state.pool_for_entity_id(&app, &session_id).await?;
    let session = crate::services::discord_recording::load_session(&pool, &session_id).await?;
    let pool = state.pool_for_campaign(&app, &session.campaign_id).await?;
    session_discord::add_shared_account_character(
        &pool,
        &session.campaign_id,
        &session_id,
        &discord_user_id,
        &character_id,
    )
    .await
}

#[tauri::command]
pub fn discord_connected_user() -> Result<Option<DiscordConnectedUser>, AppError> {
    Ok(crate::services::discord_secrets::load_oauth_session()?
        .and_then(|s| {
            s.discord_user_id.map(|id| DiscordConnectedUser {
                discord_user_id: id,
                discord_username: s.discord_username,
            })
        }))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordConnectedUser {
    pub discord_user_id: String,
    pub discord_username: Option<String>,
}
