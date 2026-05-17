use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::db::RecordingState;
use crate::db::AppState;
use crate::error::AppError;
use crate::models::Session;
use crate::services::discord_recording::{
    self, pipeline_state, run_transcription, start_recording, stop_recording, write_bot_token,
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
    start_recording(&app, state.pool(), &session_id, recording_state.inner()).await
}

#[tauri::command]
pub async fn session_stop_recording(
    app: AppHandle,
    session_id: String,
    state: State<'_, AppState>,
    recording_state: State<'_, Arc<RecordingState>>,
) -> Result<Session, AppError> {
    stop_recording(&app, state.pool(), &session_id, recording_state.inner()).await
}

#[tauri::command]
pub async fn session_run_transcription(
    app: AppHandle,
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Session, AppError> {
    run_transcription(&app, state.pool(), &session_id).await
}

#[tauri::command]
pub async fn get_session_pipeline_state(
    app: AppHandle,
    session_id: String,
    state: State<'_, AppState>,
    recording_state: State<'_, Arc<RecordingState>>,
) -> Result<SessionPipelineState, AppError> {
    let active = recording_state
        .0
        .lock()
        .map_err(|_| AppError::Internal("recording state lock poisoned".into()))?
        .as_ref()
        .map(|r| r.session_id == session_id)
        .unwrap_or(false);
    pipeline_state(&app, state.pool(), &session_id, active).await
}
