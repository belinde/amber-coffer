use crate::error::AppError;

/// List handouts for a session. Stub — business logic not implemented yet.
#[tauri::command]
pub async fn list_handouts(_session_id: String) -> Result<Vec<serde_json::Value>, AppError> {
    Err(AppError::NotImplemented("list_handouts".into()))
}

/// Create a handout draft (not yet shown). Stub.
#[tauri::command]
pub async fn create_handout(
    _session_id: String,
    _label: String,
    _body: Option<String>,
    _image_local_path: Option<String>,
) -> Result<serde_json::Value, AppError> {
    Err(AppError::NotImplemented("create_handout".into()))
}
