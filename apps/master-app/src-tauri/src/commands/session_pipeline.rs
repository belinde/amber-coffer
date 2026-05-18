use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::db::{AppState, RecordingState, TranscriptionState};
use crate::error::AppError;
use crate::models::Session;
use crate::services::discord_recording::{
    self, pipeline_state, start_recording, start_transcription, stop_recording, write_bot_token,
    SessionPipelineState,
};

#[tauri::command]
pub async fn set_discord_bot_token(app: AppHandle, token: String) -> Result<(), AppError> {
    write_bot_token(&app, token)
}

#[tauri::command]
pub async fn has_discord_bot_token(app: AppHandle) -> Result<bool, AppError> {
    discord_recording::has_bot_token(&app)
}

#[tauri::command]
pub async fn session_start_recording(
    app: AppHandle,
    session_id: String,
    state: State<'_, AppState>,
    recording_state: State<'_, Arc<RecordingState>>,
) -> Result<Session, AppError> {
    let pool = state.pool_for_entity_id(&app, &session_id).await?;
    start_recording(&app, &pool, &session_id, recording_state.inner()).await
}

#[tauri::command]
pub async fn session_stop_recording(
    app: AppHandle,
    session_id: String,
    state: State<'_, AppState>,
    recording_state: State<'_, Arc<RecordingState>>,
) -> Result<Session, AppError> {
    let pool = state.pool_for_entity_id(&app, &session_id).await?;
    stop_recording(&app, &pool, &session_id, recording_state.inner()).await
}

#[tauri::command]
pub async fn session_run_transcription(
    app: AppHandle,
    session_id: String,
    state: State<'_, AppState>,
    transcription_state: State<'_, Arc<TranscriptionState>>,
) -> Result<Session, AppError> {
    let pool = state.pool_for_entity_id(&app, &session_id).await?;
    start_transcription(
        app,
        pool,
        session_id,
        transcription_state.inner().clone(),
    )
    .await
}

#[tauri::command]
pub async fn get_session_pipeline_state(
    app: AppHandle,
    session_id: String,
    state: State<'_, AppState>,
    recording_state: State<'_, Arc<RecordingState>>,
    transcription_state: State<'_, Arc<TranscriptionState>>,
) -> Result<SessionPipelineState, AppError> {
    let active = recording_state
        .0
        .lock()
        .map_err(|_| AppError::Internal("recording state lock poisoned".into()))?
        .as_ref()
        .map(|r| r.session_id == session_id)
        .unwrap_or(false);
    let pool = state.pool_for_entity_id(&app, &session_id).await?;
    pipeline_state(
        &app,
        &pool,
        &session_id,
        active,
        transcription_state.inner().as_ref(),
    )
    .await
}
