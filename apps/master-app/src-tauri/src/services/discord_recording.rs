use std::fs;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

use serde::Deserialize;
use sqlx::SqlitePool;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

use crate::db::{RecordingRuntime, RecordingState};
use crate::error::{AppError, AppResult};
use crate::models::Session;
use crate::services::session_paths::{
    self, campaign_root, ensure_session_dirs, relative_to_campaign, session_manifest_path,
    session_raw_merged_transcript_path,
};
use crate::util::now_ms;

const BOT_TOKEN_STORE_KEY: &str = "discord.botToken";
const SETTINGS_STORE: &str = "amber-settings.json";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestTrack {
    discord_user_id: String,
    relative_path: String,
    duration_ms: Option<i64>,
    sample_rate: Option<i32>,
    channels: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestChunk {
    discord_user_id: String,
    relative_path: String,
    duration_ms: i64,
    sample_rate: Option<i32>,
    channels: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecordingManifest {
    version: u8,
    source_kind: String,
    #[serde(default)]
    tracks: Vec<ManifestTrack>,
    #[serde(default)]
    chunks: Vec<ManifestChunk>,
}

pub fn read_bot_token(handle: &AppHandle) -> AppResult<String> {
    let store = handle
        .store(SETTINGS_STORE)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let token = store
        .get(BOT_TOKEN_STORE_KEY)
        .and_then(|v| v.as_str().map(|s| s.to_string()));
    token.ok_or_else(|| crate::validation_issue::required_field(&["discord", "botToken"]))
}

pub fn write_bot_token(handle: &AppHandle, token: String) -> AppResult<()> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Err(crate::validation_issue::required_field(&["discord", "botToken"]));
    }
    let store = handle
        .store(SETTINGS_STORE)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    store.set(BOT_TOKEN_STORE_KEY, trimmed);
    store
        .save()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}

pub fn has_bot_token(handle: &AppHandle) -> AppResult<bool> {
    let store = handle
        .store(SETTINGS_STORE)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let configured = store
        .get(BOT_TOKEN_STORE_KEY)
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    Ok(configured)
}

pub async fn load_session(pool: &SqlitePool, session_id: &str) -> AppResult<Session> {
    sqlx::query_as::<_, Session>(
        r#"
        SELECT id, campaign_id, number, title, status, started_at, ended_at,
               summary, events_body, gm_notes, public_summary,
               locations_visited_json, npcs_encountered_json, played_at,
               created_at, updated_at, version
        FROM sessions WHERE id = ?
        "#,
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("session {session_id}")))
}

async fn load_campaign_channel(pool: &SqlitePool, campaign_id: &str) -> AppResult<String> {
    let row: Option<(Option<String>,)> =
        sqlx::query_as("SELECT discord_channel_id FROM campaigns WHERE id = ?")
            .bind(campaign_id)
            .fetch_optional(pool)
            .await?;

    let channel_id = row
        .and_then(|(id,)| id)
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| {
            crate::validation_issue::required_field(&["campaign", "discordChannelId"])
        })?;
    Ok(channel_id)
}

pub fn spawn_discord_bot(
    token: &str,
    channel_id: &str,
    session_id: &str,
    output_dir: &std::path::Path,
) -> AppResult<Child> {
    let script = session_paths::discord_bot_entry_script();
    if !script.exists() {
        return Err(AppError::Internal(format!(
            "discord bot entry not found at {}; run pnpm --filter @amber/discord-bot build",
            script.display()
        )));
    }

    let child = Command::new("node")
        .arg(&script)
        .arg("record")
        .arg("--channel-id")
        .arg(channel_id)
        .arg("--session-id")
        .arg(session_id)
        .arg("--output-dir")
        .arg(output_dir)
        .env("DISCORD_BOT_TOKEN", token)
        .stdin(Stdio::piped())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| AppError::Internal(format!("failed to spawn discord bot: {e}")))?;

    Ok(child)
}

pub async fn start_recording(
    handle: &AppHandle,
    pool: &SqlitePool,
    session_id: &str,
    recording_state: &RecordingState,
) -> AppResult<Session> {
    {
        let guard = recording_state.0.lock().map_err(|_| {
            AppError::Internal("recording state lock poisoned".into())
        })?;
        if guard.is_some() {
            return Err(AppError::Internal("recording already active".into()));
        }
    }

    let session = load_session(pool, session_id).await?;
    const STARTABLE: &[&str] = &["planned", "recording", "recorded", "transcribed"];
    if !STARTABLE.contains(&session.status.as_str()) {
        return Err(AppError::Internal(format!(
            "session status does not allow recording, got {}",
            session.status
        )));
    }

    let channel_id = load_campaign_channel(pool, &session.campaign_id).await?;
    let token = read_bot_token(handle)?;
    let session_dir = ensure_session_dirs(handle, &session.campaign_id, session.number)?;

    let child = spawn_discord_bot(&token, &channel_id, session_id, &session_dir)?;

    let now = now_ms();
    sqlx::query(
        r#"
        UPDATE sessions
        SET status = 'recording', started_at = COALESCE(started_at, ?), updated_at = ?, version = version + 1
        WHERE id = ?
        "#,
    )
    .bind(now)
    .bind(now)
    .bind(session_id)
    .execute(pool)
    .await?;

    {
        let mut guard = recording_state.0.lock().map_err(|_| {
            AppError::Internal("recording state lock poisoned".into())
        })?;
        *guard = Some(RecordingRuntime {
            session_id: session_id.to_string(),
            child,
        });
    }

    Ok(load_session(pool, session_id).await?)
}

pub async fn stop_recording(
    handle: &AppHandle,
    pool: &SqlitePool,
    session_id: &str,
    recording_state: &RecordingState,
) -> AppResult<Session> {
    let mut child = {
        let mut guard = recording_state.0.lock().map_err(|_| {
            AppError::Internal("recording state lock poisoned".into())
        })?;
        let rt = guard
            .take()
            .ok_or_else(|| AppError::Internal("no active recording".into()))?;
        if rt.session_id != session_id {
            return Err(AppError::Internal("session id mismatch for active recording".into()));
        }
        rt.child
    };
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let _ = writeln!(stdin, "stop");
    }

    // Grace period for manifest write
    std::thread::sleep(Duration::from_millis(2500));
    let _ = child.kill();
    let _ = child.wait();

    let session = load_session(pool, session_id).await?;
    let session_dir = session_paths::session_dir(handle, &session.campaign_id, session.number)?;
    ingest_manifest(handle, pool, &session, &session_dir).await?;

    let now = now_ms();
    sqlx::query(
        r#"
        UPDATE sessions
        SET status = 'recorded', ended_at = COALESCE(ended_at, ?), updated_at = ?, version = version + 1
        WHERE id = ?
        "#,
    )
    .bind(now)
    .bind(now)
    .bind(session_id)
    .execute(pool)
    .await?;

    Ok(load_session(pool, session_id).await?)
}

async fn ingest_manifest(
    _handle: &AppHandle,
    pool: &SqlitePool,
    session: &Session,
    session_dir: &std::path::Path,
) -> AppResult<()> {
    let manifest_path = session_manifest_path(session_dir);
    if !manifest_path.exists() {
        tracing::warn!(path = %manifest_path.display(), "recording manifest missing");
        return Ok(());
    }

    let raw = fs::read_to_string(&manifest_path).map_err(|e| AppError::Internal(e.to_string()))?;
    let manifest: RecordingManifest =
        serde_json::from_str(&raw).map_err(|e| AppError::Internal(e.to_string()))?;

    let now = now_ms();

    sqlx::query("DELETE FROM recordings WHERE session_id = ?")
        .bind(&session.id)
        .execute(pool)
        .await?;

    if manifest.version >= 2 && !manifest.chunks.is_empty() {
        for chunk in manifest.chunks {
            let id = Uuid::now_v7().to_string();
            let rel = format!(
                "sessions/{}/{}",
                session.number, chunk.relative_path
            );

            sqlx::query(
                r#"
                INSERT INTO recordings (
                  id, session_id, user_discord_id, source_kind, file_path,
                  duration_ms, sample_rate, channels, created_at, updated_at, version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                "#,
            )
            .bind(&id)
            .bind(&session.id)
            .bind(&chunk.discord_user_id)
            .bind(&manifest.source_kind)
            .bind(&rel)
            .bind(chunk.duration_ms)
            .bind(chunk.sample_rate)
            .bind(chunk.channels)
            .bind(now)
            .bind(now)
            .execute(pool)
            .await?;
        }
    } else {
        for track in manifest.tracks {
            let id = Uuid::now_v7().to_string();
            let rel = track.relative_path.clone();

            sqlx::query(
                r#"
                INSERT INTO recordings (
                  id, session_id, user_discord_id, source_kind, file_path,
                  duration_ms, sample_rate, channels, created_at, updated_at, version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                "#,
            )
            .bind(&id)
            .bind(&session.id)
            .bind(&track.discord_user_id)
            .bind(&manifest.source_kind)
            .bind(&rel)
            .bind(track.duration_ms)
            .bind(track.sample_rate)
            .bind(track.channels)
            .bind(now)
            .bind(now)
            .execute(pool)
            .await?;
        }
    }

    Ok(())
}

pub async fn run_transcription(
    handle: &AppHandle,
    pool: &SqlitePool,
    session_id: &str,
) -> AppResult<Session> {
    let session = load_session(pool, session_id).await?;
    if session.status != "recorded" && session.status != "transcribing" {
        return Err(AppError::Internal(format!(
            "session must be recorded before transcription, got {}",
            session.status
        )));
    }

    let now = now_ms();
    sqlx::query("UPDATE sessions SET status = 'transcribing', updated_at = ?, version = version + 1 WHERE id = ?")
        .bind(now)
        .bind(session_id)
        .execute(pool)
        .await?;

    let session_dir = session_paths::session_dir(handle, &session.campaign_id, session.number)?;
    let whisper_root = session_paths::whisper_module_root();
    let python = session_paths::whisper_python_executable();

    if !whisper_root.join(".venv/bin/python").is_file() {
        return Err(AppError::Internal(
            "Whisper venv missing. Run: cd tools/sidecars/whisper && python3 -m venv .venv && .venv/bin/pip install -e \".[whisper]\"".into(),
        ));
    }

    let output = Command::new(&python)
        .arg("-m")
        .arg("amber_whisper")
        .arg("transcribe")
        .arg("--session-dir")
        .arg(&session_dir)
        .arg("--language")
        .arg("it")
        .arg("--model")
        .arg("base")
        .current_dir(&whisper_root)
        .output()
        .map_err(|e| AppError::Internal(format!("failed to run whisper sidecar: {e}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::error!(%stderr, "whisper sidecar failed");
        return Err(AppError::Internal(format!(
            "whisper sidecar failed: {stderr}"
        )));
    }

    let camp_root = campaign_root(handle, &session.campaign_id)?;
    let raw_abs = session_raw_merged_transcript_path(&session_dir);
    let raw_text = fs::read_to_string(&raw_abs).ok();
    let rel_path = relative_to_campaign(&camp_root, &raw_abs).ok();

    let transcript_id = Uuid::now_v7().to_string();
    let processed = now_ms();

    sqlx::query("DELETE FROM transcripts WHERE session_id = ?")
        .bind(session_id)
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        INSERT INTO transcripts (
          id, session_id, source_recording_id, raw_text, raw_transcript_path,
          refined_text, stt_model, llm_model, processed_at, created_at, updated_at, version
        ) VALUES (?, ?, NULL, ?, ?, NULL, 'whisper-base', NULL, ?, ?, ?, 1)
        "#,
    )
    .bind(&transcript_id)
    .bind(session_id)
    .bind(&raw_text)
    .bind(&rel_path)
    .bind(processed)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    sqlx::query(
        "UPDATE sessions SET status = 'transcribed', updated_at = ?, version = version + 1 WHERE id = ?",
    )
    .bind(now)
    .bind(session_id)
    .execute(pool)
    .await?;

    Ok(load_session(pool, session_id).await?)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPipelineState {
    pub session_id: String,
    pub status: String,
    pub recording_active: bool,
    pub has_bot_token: bool,
    pub session_dir: Option<String>,
    pub has_manifest: bool,
    pub has_raw_transcript: bool,
    pub recording_count: i64,
}

pub async fn pipeline_state(
    handle: &AppHandle,
    pool: &SqlitePool,
    session_id: &str,
    recording_active: bool,
) -> AppResult<SessionPipelineState> {
    let session = load_session(pool, session_id).await?;
    let session_dir = session_paths::session_dir(handle, &session.campaign_id, session.number).ok();
    let has_manifest = session_dir
        .as_ref()
        .map(|d| session_manifest_path(d).exists())
        .unwrap_or(false);
    let has_raw = session_dir
        .as_ref()
        .map(|d| session_raw_merged_transcript_path(d).exists())
        .unwrap_or(false);

    let (recording_count,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM recordings WHERE session_id = ?")
            .bind(session_id)
            .fetch_one(pool)
            .await?;

    Ok(SessionPipelineState {
        session_id: session_id.to_string(),
        status: session.status,
        recording_active,
        has_bot_token: has_bot_token(handle)?,
        session_dir: session_dir.map(|p| p.to_string_lossy().to_string()),
        has_manifest,
        has_raw_transcript: has_raw,
        recording_count,
    })
}
