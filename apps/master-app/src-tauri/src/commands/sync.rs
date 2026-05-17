use crate::error::AppError;

#[tauri::command]
pub async fn publish_sync_message(_campaign_id: String, _payload_json: String) -> Result<(), AppError> {
    Err(AppError::NotImplemented("publish_sync_message".into()))
}
