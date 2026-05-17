use std::path::{Path, PathBuf};

use tauri::AppHandle;
use tauri::Manager;

use crate::error::{AppError, AppResult};

/// Monorepo root (three levels above `src-tauri`).
pub fn monorepo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..")
}

pub fn app_data_dir(handle: &AppHandle) -> AppResult<PathBuf> {
    handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(e.to_string()))
}

pub fn campaigns_root(handle: &AppHandle) -> AppResult<PathBuf> {
    Ok(app_data_dir(handle)?.join("campaigns"))
}

/// Absolute directory for a session workspace.
pub fn session_dir(handle: &AppHandle, campaign_id: &str, session_number: i32) -> AppResult<PathBuf> {
    Ok(campaigns_root(handle)?
        .join(campaign_id)
        .join("sessions")
        .join(session_number.to_string()))
}

pub fn session_audio_discord_dir(session_root: &Path) -> PathBuf {
    session_root.join("audio").join("discord")
}

pub fn session_manifest_path(session_root: &Path) -> PathBuf {
    session_root.join("audio").join("manifest.json")
}

pub fn session_raw_merged_transcript_path(session_root: &Path) -> PathBuf {
    session_root.join("transcripts").join("raw-merged.txt")
}

/// Path relative to campaign root, e.g. `sessions/3/audio/discord/123.wav`.
pub fn relative_to_campaign(campaign_root: &Path, absolute: &Path) -> AppResult<String> {
    let rel = absolute
        .strip_prefix(campaign_root)
        .map_err(|_| AppError::Internal("path outside campaign root".into()))?;
  Ok(rel
        .to_string_lossy()
        .replace('\\', "/"))
}

pub fn campaign_root(handle: &AppHandle, campaign_id: &str) -> AppResult<PathBuf> {
    Ok(campaigns_root(handle)?.join(campaign_id))
}

pub fn ensure_session_dirs(handle: &AppHandle, campaign_id: &str, session_number: i32) -> AppResult<PathBuf> {
    let root = session_dir(handle, campaign_id, session_number)?;
    std::fs::create_dir_all(session_audio_discord_dir(&root))
        .map_err(|e| AppError::Internal(e.to_string()))?;
    std::fs::create_dir_all(root.join("transcripts"))
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(root)
}

pub fn discord_bot_entry_script() -> PathBuf {
    monorepo_root().join("apps/discord-bot/dist/cli.js")
}

pub fn whisper_module_root() -> PathBuf {
    monorepo_root().join("tools/sidecars/whisper")
}

/// Prefer the sidecar venv Python when present (`pip install -e ".[whisper]"` in whisper_module_root).
pub fn whisper_python_executable() -> PathBuf {
    let venv_python = whisper_module_root().join(".venv/bin/python");
    if venv_python.is_file() {
        return venv_python;
    }
    PathBuf::from("python3")
}
