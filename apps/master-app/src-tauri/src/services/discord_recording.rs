use std::fs;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

use serde::Deserialize;
use sqlx::SqlitePool;
use tauri::AppHandle;
use uuid::Uuid;

use crate::db::{RecordingRuntime, RecordingState, TranscriptionRuntime, TranscriptionState};
use crate::error::{AppError, AppResult};
use crate::models::{normalize_play_language, Session};
use crate::services::discord_secrets;
use crate::services::recording_ingest;
use crate::services::session_discord;
use crate::services::session_paths::{
    self, campaign_root, ensure_session_dirs, relative_to_campaign, session_manifest_path,
    session_raw_merged_transcript_path,
};
use crate::util::now_ms;

pub fn read_bot_token(handle: &AppHandle) -> AppResult<String> {
    discord_secrets::load_bot_token_after_migration(handle)
}

pub fn write_bot_token(handle: &AppHandle, token: String) -> AppResult<()> {
    discord_secrets::save_bot_token(handle, &token)
}

pub fn has_bot_token(handle: &AppHandle) -> AppResult<bool> {
    let _ = discord_secrets::migrate_bot_token_from_store(handle);
    Ok(discord_secrets::has_bot_token(handle))
}

pub async fn load_session(pool: &SqlitePool, session_id: &str) -> AppResult<Session> {
    sqlx::query_as::<_, Session>(
        r#"
        SELECT id, campaign_id, number, title, play_state, status, started_at, ended_at,
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

async fn load_campaign_for_recording(
    app: &AppHandle,
    campaign_id: &str,
) -> AppResult<(String, String)> {
    let folder = crate::services::campaign_storage::resolve_storage_folder(app, campaign_id)?;
    let campaign = crate::services::campaign_storage::read_campaign_json(&folder)?;

    let channel_id = campaign
        .discord_channel_id
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| {
            crate::validation_issue::required_field(&["campaign", "discordChannelId"])
        })?;
    let play_language = normalize_play_language(&campaign.play_language)
        .map_err(|msg| AppError::Internal(msg))?;
    Ok((channel_id, play_language))
}

pub fn spawn_discord_bot(
    token: &str,
    channel_id: &str,
    session_id: &str,
    output_dir: &std::path::Path,
    locale: &str,
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
        .arg("--locale")
        .arg(locale)
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
    const STARTABLE: &[&str] = &["planned", "recording", "recorded"];
    if !STARTABLE.contains(&session.status.as_str()) {
        return Err(AppError::Internal(format!(
            "session status does not allow recording, got {}",
            session.status
        )));
    }

    let session_dir_probe =
        session_paths::session_dir(handle, &session.campaign_id, session.number).ok();
    if transcription_was_attempted(pool, session_id, &session.status, session_dir_probe.as_deref())
        .await?
    {
        return Err(AppError::Internal(
            "recording is locked after transcription has been attempted".into(),
        ));
    }

    let (channel_id, play_language) =
        load_campaign_for_recording(handle, &session.campaign_id).await?;
    let token = read_bot_token(handle)?;
    let session_dir = ensure_session_dirs(handle, &session.campaign_id, session.number)?;

    let child = spawn_discord_bot(
        &token,
        &channel_id,
        session_id,
        &session_dir,
        &play_language,
    )?;

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

    // Grace period for stop announcement + manifest write
    std::thread::sleep(Duration::from_millis(8000));
    let _ = child.kill();
    let _ = child.wait();

    let session = load_session(pool, session_id).await?;
    let session_dir = session_paths::session_dir(handle, &session.campaign_id, session.number)?;
    recording_ingest::ingest_recording_handoff(handle, pool, &session, &session_dir).await?;

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

const TRANSCRIPTION_PROGRESS_FILE: &str = "transcripts/transcription-progress.json";
const TRANSCRIPTION_ATTEMPTED_MARKER: &str = "transcripts/.transcription-attempted";

fn transcription_attempted_marker_path(session_dir: &std::path::Path) -> std::path::PathBuf {
    session_dir.join(TRANSCRIPTION_ATTEMPTED_MARKER)
}

fn mark_transcription_attempted(session_dir: &std::path::Path) -> AppResult<()> {
    let path = transcription_attempted_marker_path(session_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            AppError::Internal(format!("failed to create transcripts dir: {e}"))
        })?;
    }
    fs::write(&path, b"").map_err(|e| {
        AppError::Internal(format!("failed to write transcription attempted marker: {e}"))
    })
}

fn status_implies_transcription_attempted(status: &str) -> bool {
    matches!(
        status,
        "transcribing" | "transcribed" | "refining" | "refined" | "validating" | "published"
    )
}

async fn transcription_was_attempted(
    pool: &SqlitePool,
    session_id: &str,
    status: &str,
    session_dir: Option<&std::path::Path>,
) -> AppResult<bool> {
    if status_implies_transcription_attempted(status) {
        return Ok(true);
    }

    let (transcript_count,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM transcripts WHERE session_id = ?")
            .bind(session_id)
            .fetch_one(pool)
            .await?;

    if transcript_count > 0 {
        return Ok(true);
    }

    let Some(dir) = session_dir else {
        return Ok(false);
    };

    Ok(transcription_attempted_marker_path(dir).exists()
        || session_raw_merged_transcript_path(dir).exists()
        || transcription_progress_path(dir).exists())
}

#[derive(Debug, Deserialize)]
struct TranscriptionProgressFile {
    current: u64,
    total: u64,
}

fn transcription_progress_path(session_dir: &std::path::Path) -> std::path::PathBuf {
    session_dir.join(TRANSCRIPTION_PROGRESS_FILE)
}

pub fn read_transcription_progress(session_dir: &std::path::Path) -> Option<f64> {
    let raw = fs::read_to_string(transcription_progress_path(session_dir)).ok()?;
    let parsed: TranscriptionProgressFile = serde_json::from_str(&raw).ok()?;
    if parsed.total == 0 {
        return None;
    }
    Some((parsed.current as f64 / parsed.total as f64).clamp(0.0, 1.0))
}

fn spawn_whisper_transcription(session_dir: &std::path::Path) -> AppResult<Child> {
    let whisper_root = session_paths::whisper_module_root();
    let python = session_paths::whisper_python_executable();

    if !whisper_root.join(".venv/bin/python").is_file() {
        return Err(AppError::Internal(
            "Whisper venv missing. Run: cd tools/sidecars/whisper && python3 -m venv .venv && .venv/bin/pip install -e \".[whisper]\"".into(),
        ));
    }

    let progress_path = transcription_progress_path(session_dir);
    if let Some(parent) = progress_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::remove_file(&progress_path);

    Command::new(&python)
        .arg("-m")
        .arg("amber_whisper")
        .arg("transcribe")
        .arg("--session-dir")
        .arg(session_dir)
        .arg("--language")
        .arg("it")
        .arg("--model")
        .arg("base")
        .arg("--progress-file")
        .arg(&progress_path)
        .current_dir(&whisper_root)
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| AppError::Internal(format!("failed to spawn whisper sidecar: {e}")))
}

fn session_may_start_transcription(status: &str) -> bool {
    matches!(status, "recorded" | "transcribing" | "transcribed")
}

async fn finalize_transcription_success(
    handle: &AppHandle,
    pool: &SqlitePool,
    session_id: &str,
) -> AppResult<()> {
    let session = load_session(pool, session_id).await?;
    let session_dir = session_paths::session_dir(handle, &session.campaign_id, session.number)?;
    let camp_root = campaign_root(handle, &session.campaign_id)?;
    let raw_abs = session_raw_merged_transcript_path(&session_dir);
    let raw_text = fs::read_to_string(&raw_abs).ok();
    let rel_path = relative_to_campaign(&camp_root, &raw_abs).ok();

    let now = now_ms();
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

    recording_ingest::attribute_transcript_speakers(pool, session_id, &session_dir).await?;

    Ok(())
}

async fn revert_transcription_to_recorded(pool: &SqlitePool, session_id: &str) -> AppResult<bool> {
    let now = now_ms();
    let result = sqlx::query(
        "UPDATE sessions SET status = 'recorded', updated_at = ?, version = version + 1 WHERE id = ? AND status = 'transcribing'",
    )
    .bind(now)
    .bind(session_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

fn clear_transcription_slot(transcription_state: &TranscriptionState, session_id: &str) {
    let Ok(mut guard) = transcription_state.0.lock() else {
        return;
    };
    if guard
        .as_ref()
        .is_some_and(|rt| rt.session_id == session_id)
    {
        *guard = None;
    }
}

fn transcription_slot_active(transcription_state: &TranscriptionState, session_id: &str) -> AppResult<bool> {
    let guard = transcription_state
        .0
        .lock()
        .map_err(|_| AppError::Internal("transcription state lock poisoned".into()))?;
    Ok(guard
        .as_ref()
        .is_some_and(|rt| rt.session_id == session_id))
}

fn clear_transcription_slot_after_wait(
    transcription_state: &TranscriptionState,
    session_id: &str,
) {
    let Ok(mut guard) = transcription_state.0.lock() else {
        return;
    };
    if guard
        .as_ref()
        .is_some_and(|rt| rt.session_id == session_id)
    {
        *guard = None;
    }
}

fn spawn_transcription_completion_task(
    handle: AppHandle,
    pool: SqlitePool,
    session_id: String,
    transcription_state: std::sync::Arc<TranscriptionState>,
) {
    let sid = session_id.clone();
    tauri::async_runtime::spawn(async move {
        let child = {
            let mut guard = match transcription_state.0.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            let Some(rt) = guard.as_mut() else {
                return;
            };
            if rt.session_id != sid {
                return;
            }
            rt.child.take()
        };
        let Some(mut child) = child else {
            let _ = revert_transcription_to_recorded(&pool, &sid).await;
            clear_transcription_slot_after_wait(&transcription_state, &sid);
            return;
        };

        let exit_status = child.wait();

        match exit_status {
            Ok(status) if status.success() => {
                if let Err(err) = finalize_transcription_success(&handle, &pool, &sid).await {
                    tracing::error!(%err, session_id = %sid, "transcription finalize failed");
                    let _ = revert_transcription_to_recorded(&pool, &sid).await;
                }
            }
            Ok(status) => {
                tracing::error!(?status, session_id = %sid, "whisper sidecar exited with error");
                let _ = revert_transcription_to_recorded(&pool, &sid).await;
            }
            Err(err) => {
                tracing::error!(%err, session_id = %sid, "whisper sidecar wait failed");
                let _ = revert_transcription_to_recorded(&pool, &sid).await;
            }
        }

        clear_transcription_slot_after_wait(&transcription_state, &sid);
    });
}

pub async fn start_transcription(
    handle: AppHandle,
    pool: SqlitePool,
    session_id: String,
    transcription_state: std::sync::Arc<TranscriptionState>,
) -> AppResult<Session> {
    {
        let guard = transcription_state
            .0
            .lock()
            .map_err(|_| AppError::Internal("transcription state lock poisoned".into()))?;
        if guard.is_some() {
            return Err(AppError::Internal(
                "transcription already active for another session".into(),
            ));
        }
    }

    let session = load_session(&pool, &session_id).await?;
    if !session_may_start_transcription(&session.status) {
        return Err(AppError::Internal(format!(
            "session must be recorded or transcribed before transcription, got {}",
            session.status
        )));
    }

    let session_dir = session_paths::session_dir(&handle, &session.campaign_id, session.number)?;
    recording_ingest::export_manifest_from_db(&pool, &session, &session_dir).await?;
    recording_ingest::export_speaker_labels(&pool, &session_id, &session_dir).await?;
    mark_transcription_attempted(&session_dir)?;

    {
        let mut guard = transcription_state
            .0
            .lock()
            .map_err(|_| AppError::Internal("transcription state lock poisoned".into()))?;
        *guard = Some(TranscriptionRuntime {
            session_id: session_id.clone(),
            child: None,
        });
    }

    let now = now_ms();
    sqlx::query(
        "UPDATE sessions SET status = 'transcribing', updated_at = ?, version = version + 1 WHERE id = ?",
    )
    .bind(now)
    .bind(&session_id)
    .execute(&pool)
    .await?;

    let handle_bg = handle.clone();
    let pool_bg = pool.clone();
    let session_id_bg = session_id.clone();
    let session_dir_bg = session_dir;
    let transcription_state_bg = transcription_state.clone();
    tauri::async_runtime::spawn(async move {
        let child_result = tokio::task::spawn_blocking(move || {
            spawn_whisper_transcription(&session_dir_bg)
        })
        .await;

        let mut child = match child_result {
            Ok(Ok(child)) => child,
            Ok(Err(err)) => {
                tracing::error!(%err, session_id = %session_id_bg, "whisper spawn failed");
                clear_transcription_slot(&transcription_state_bg, &session_id_bg);
                let _ = revert_transcription_to_recorded(&pool_bg, &session_id_bg).await;
                return;
            }
            Err(err) => {
                tracing::error!(%err, session_id = %session_id_bg, "whisper spawn task join failed");
                clear_transcription_slot(&transcription_state_bg, &session_id_bg);
                let _ = revert_transcription_to_recorded(&pool_bg, &session_id_bg).await;
                return;
            }
        };

        let attach_failed = {
            let mut guard = match transcription_state_bg.0.lock() {
                Ok(g) => g,
                Err(_) => {
                    let _ = child.kill();
                    return;
                }
            };
            match guard.as_mut() {
                None => {
                    let _ = child.kill();
                    true
                }
                Some(rt) if rt.session_id != session_id_bg => {
                    let _ = child.kill();
                    true
                }
                Some(rt) => {
                    rt.child = Some(child);
                    false
                }
            }
        };
        if attach_failed {
            let _ = revert_transcription_to_recorded(&pool_bg, &session_id_bg).await;
            return;
        }

        spawn_transcription_completion_task(
            handle_bg,
            pool_bg,
            session_id_bg,
            transcription_state_bg,
        );
    });

    load_session(&pool, &session_id).await
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPipelineState {
    pub session_id: String,
    pub status: String,
    pub recording_active: bool,
    pub transcription_active: bool,
    pub transcription_progress: Option<f64>,
    pub has_bot_token: bool,
    pub session_dir: Option<String>,
    pub has_manifest: bool,
    pub has_raw_transcript: bool,
    pub has_refined_transcript: bool,
    pub transcription_attempted: bool,
    pub recording_count: i64,
    pub participant_count: i64,
    pub player_participant_count: i64,
}

pub async fn pipeline_state(
    handle: &AppHandle,
    pool: &SqlitePool,
    session_id: &str,
    recording_active: bool,
    transcription_state: &TranscriptionState,
) -> AppResult<SessionPipelineState> {
    let mut session = load_session(pool, session_id).await?;
    let session_dir = session_paths::session_dir(handle, &session.campaign_id, session.number).ok();
    let has_manifest = session_dir
        .as_ref()
        .map(|d| session_manifest_path(d).exists())
        .unwrap_or(false);
    let has_raw = session_dir
        .as_ref()
        .map(|d| session_raw_merged_transcript_path(d).exists())
        .unwrap_or(false);

    let mut transcription_active = transcription_slot_active(transcription_state, session_id)?;

    let transcription_progress = session_dir
        .as_ref()
        .and_then(|d| read_transcription_progress(d));

    let progress_in_flight = transcription_progress.is_some_and(|p| p < 1.0);

    if transcription_active && session.status == "recorded" && !has_raw {
        let now = now_ms();
        sqlx::query(
            "UPDATE sessions SET status = 'transcribing', updated_at = ?, version = version + 1 WHERE id = ? AND status = 'recorded'",
        )
        .bind(now)
        .bind(session_id)
        .execute(pool)
        .await?;
        session = load_session(pool, session_id).await?;
    }

    if session.status == "transcribing" && !transcription_active && !has_raw && !progress_in_flight {
        if revert_transcription_to_recorded(pool, session_id).await? {
            tracing::info!(session_id = %session_id, "recovered stale transcribing session status");
            session = load_session(pool, session_id).await?;
        }
        transcription_active = false;
    }

    let (recording_count,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM recordings WHERE session_id = ?")
            .bind(session_id)
            .fetch_one(pool)
            .await?;

    let (participant_count, player_participant_count) =
        session_discord::participant_counts(pool, session_id).await.unwrap_or((0, 0));

    let transcription_attempted = transcription_was_attempted(
        pool,
        session_id,
        &session.status,
        session_dir.as_deref(),
    )
    .await?;

    let (has_refined,): (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*) FROM transcripts
        WHERE session_id = ?
          AND refined_text IS NOT NULL
          AND TRIM(refined_text) != ''
        "#,
    )
    .bind(session_id)
    .fetch_one(pool)
    .await?;

    Ok(SessionPipelineState {
        session_id: session_id.to_string(),
        status: session.status,
        recording_active,
        transcription_active,
        transcription_progress,
        has_bot_token: has_bot_token(handle)?,
        session_dir: session_dir.map(|p| p.to_string_lossy().to_string()),
        has_manifest,
        has_raw_transcript: has_raw,
        has_refined_transcript: has_refined > 0,
        transcription_attempted,
        recording_count,
        participant_count,
        player_participant_count,
    })
}
