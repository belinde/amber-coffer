use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::AppHandle;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::Session;
use crate::services::discord_secrets;
use crate::services::session_discord;
use crate::services::session_paths::session_manifest_path;
use crate::util::now_ms;

pub const GM_SPEAKER_LABEL: &str = "Master";

/// ffmpeg may leave a tiny invalid Ogg shell when a speaking segment had no decoded audio.
const MIN_OGG_BYTES: u64 = 256;

fn is_usable_ogg_file(path: &Path) -> bool {
    fs::metadata(path)
        .map(|meta| meta.is_file() && meta.len() >= MIN_OGG_BYTES)
        .unwrap_or(false)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestTrack {
    discord_user_id: String,
    display_name: Option<String>,
    relative_path: String,
    session_offset_ms: Option<i64>,
    duration_ms: Option<i64>,
    sample_rate: Option<i32>,
    channels: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestChunk {
    discord_user_id: String,
    display_name: Option<String>,
    relative_path: String,
    session_offset_ms: i64,
    duration_ms: i64,
    sample_rate: Option<i32>,
    channels: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecordingManifest {
    version: u8,
    session_id: Option<String>,
    source_kind: String,
    started_at: Option<i64>,
    ended_at: Option<i64>,
    channel_id: Option<String>,
    #[serde(default)]
    tracks: Vec<ManifestTrack>,
    #[serde(default)]
    chunks: Vec<ManifestChunk>,
}

#[derive(Debug, Clone)]
struct HandoffSegment {
    discord_user_id: String,
    display_name: String,
    relative_path: String,
    session_offset_ms: i64,
    duration_ms: Option<i64>,
    sample_rate: Option<i32>,
    channels: Option<i32>,
}

pub async fn ingest_recording_handoff(
    _handle: &AppHandle,
    pool: &SqlitePool,
    session: &Session,
    session_dir: &Path,
) -> AppResult<()> {
    let manifest_path = session_manifest_path(session_dir);
    if !manifest_path.exists() {
        tracing::warn!(path = %manifest_path.display(), "recording handoff manifest missing");
        return Ok(());
    }

    let raw = fs::read_to_string(&manifest_path).map_err(|e| AppError::Internal(e.to_string()))?;
    let manifest: RecordingManifest =
        serde_json::from_str(&raw).map_err(|e| AppError::Internal(e.to_string()))?;

    if let Some(ref manifest_session_id) = manifest.session_id {
        if manifest_session_id != &session.id {
            tracing::warn!(
                expected = %session.id,
                got = %manifest_session_id,
                "recording handoff manifest session_id mismatch"
            );
        }
    }

    let segments = handoff_segments_from_manifest(&manifest);
    let segments: Vec<HandoffSegment> = segments
        .into_iter()
        .filter(|seg| {
            let abs = session_dir.join(&seg.relative_path);
            if is_usable_ogg_file(&abs) {
                return true;
            }
            tracing::warn!(
                path = %abs.display(),
                "skipping recording handoff chunk with missing or invalid audio file"
            );
            false
        })
        .collect();
    if segments.is_empty() {
        return Ok(());
    }

    let now = now_ms();
    insert_handoff_segments(pool, &session.id, &segments, now).await?;
    consolidate_session_recordings(pool, session, session_dir, &manifest.source_kind, now).await?;
    session_discord::seed_assignments_from_recordings(pool, &session.campaign_id, &session.id).await?;
    export_manifest_from_db(pool, session, session_dir).await?;

    Ok(())
}

fn handoff_segments_from_manifest(manifest: &RecordingManifest) -> Vec<HandoffSegment> {
    if manifest.version >= 2 && !manifest.chunks.is_empty() {
        return manifest
            .chunks
            .iter()
            .map(|c| HandoffSegment {
                discord_user_id: c.discord_user_id.clone(),
                display_name: c
                    .display_name
                    .clone()
                    .unwrap_or_else(|| c.discord_user_id.clone()),
                relative_path: c.relative_path.clone(),
                session_offset_ms: c.session_offset_ms,
                duration_ms: Some(c.duration_ms),
                sample_rate: c.sample_rate,
                channels: c.channels,
            })
            .collect();
    }

    manifest
        .tracks
        .iter()
        .map(|t| HandoffSegment {
            discord_user_id: t.discord_user_id.clone(),
            display_name: t
                .display_name
                .clone()
                .unwrap_or_else(|| t.discord_user_id.clone()),
            relative_path: t.relative_path.clone(),
            session_offset_ms: t.session_offset_ms.unwrap_or(0),
            duration_ms: t.duration_ms,
            sample_rate: t.sample_rate,
            channels: t.channels,
        })
        .collect()
}

async fn insert_handoff_segments(
    pool: &SqlitePool,
    session_id: &str,
    segments: &[HandoffSegment],
    now: i64,
) -> AppResult<()> {
    for seg in segments {
        let (existing,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM recording_segments WHERE session_id = ? AND relative_path = ?",
        )
        .bind(session_id)
        .bind(&seg.relative_path)
        .fetch_one(pool)
        .await?;
        if existing > 0 {
            continue;
        }

        let id = Uuid::now_v7().to_string();
        sqlx::query(
            r#"
            INSERT INTO recording_segments (
              id, session_id, discord_user_id, discord_display_name, relative_path,
              session_offset_ms, duration_ms, sample_rate, channels, status,
              consolidated_recording_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'raw', NULL, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(session_id)
        .bind(&seg.discord_user_id)
        .bind(&seg.display_name)
        .bind(&seg.relative_path)
        .bind(seg.session_offset_ms)
        .bind(seg.duration_ms)
        .bind(seg.sample_rate)
        .bind(seg.channels)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await?;
    }
    Ok(())
}

/// Break FKs from segments/transcripts before replacing consolidated `recordings` rows.
async fn clear_recording_row_references(pool: &SqlitePool, session_id: &str) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE recording_segments
        SET consolidated_recording_id = NULL
        WHERE session_id = ? AND consolidated_recording_id IS NOT NULL
        "#,
    )
    .bind(session_id)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        UPDATE transcripts
        SET source_recording_id = NULL
        WHERE session_id = ? AND source_recording_id IS NOT NULL
        "#,
    )
    .bind(session_id)
    .execute(pool)
    .await?;

    Ok(())
}

async fn consolidate_session_recordings(
    pool: &SqlitePool,
    session: &Session,
    session_dir: &Path,
    source_kind: &str,
    now: i64,
) -> AppResult<()> {
    let user_ids: Vec<(String,)> = sqlx::query_as(
        r#"
        SELECT DISTINCT discord_user_id FROM recording_segments
        WHERE session_id = ? AND status = 'raw'
        "#,
    )
    .bind(&session.id)
    .fetch_all(pool)
    .await?;

    clear_recording_row_references(pool, &session.id).await?;

    sqlx::query("DELETE FROM recordings WHERE session_id = ?")
        .bind(&session.id)
        .execute(pool)
        .await?;

    for (discord_user_id,) in user_ids {
        consolidate_user_recording(
            pool,
            session,
            session_dir,
            source_kind,
            &discord_user_id,
            now,
        )
        .await?;
    }

    Ok(())
}

async fn consolidate_user_recording(
    pool: &SqlitePool,
    session: &Session,
    session_dir: &Path,
    source_kind: &str,
    discord_user_id: &str,
    now: i64,
) -> AppResult<()> {
    let rows: Vec<(String, String, i64, Option<i64>, Option<i32>, Option<i32>)> = sqlx::query_as(
        r#"
        SELECT id, relative_path, session_offset_ms, duration_ms, sample_rate, channels
        FROM recording_segments
        WHERE session_id = ? AND discord_user_id = ? AND status = 'raw'
        ORDER BY session_offset_ms ASC, created_at ASC
        "#,
    )
    .bind(&session.id)
    .bind(discord_user_id)
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        return Ok(());
    }

    let display_name: Option<(String,)> = sqlx::query_as(
        "SELECT discord_display_name FROM recording_segments WHERE session_id = ? AND discord_user_id = ? LIMIT 1",
    )
    .bind(&session.id)
    .bind(discord_user_id)
    .fetch_optional(pool)
    .await?;
    let _display_name = display_name.map(|(n,)| n).unwrap_or_else(|| discord_user_id.to_string());

    let mut input_paths: Vec<PathBuf> = Vec::new();
    let mut segment_ids: Vec<String> = Vec::new();
    let mut total_duration: i64 = 0;
    let mut sample_rate = rows[0].4;
    let mut channels = rows[0].5;
    let first_offset = rows[0].2;

    let mut seen_paths = std::collections::HashSet::new();
    for (id, rel, _offset, dur, sr, ch) in &rows {
        segment_ids.push(id.clone());
        let abs = session_dir.join(rel);
        if is_usable_ogg_file(&abs) && seen_paths.insert(abs.clone()) {
            input_paths.push(abs);
        }
        total_duration += dur.unwrap_or(0);
        if sample_rate.is_none() {
            sample_rate = *sr;
        }
        if channels.is_none() {
            channels = *ch;
        }
    }

    if input_paths.is_empty() {
        return Ok(());
    }

    let user_dir = session_dir.join("audio").join("discord").join(discord_user_id);
    fs::create_dir_all(&user_dir).map_err(|e| AppError::Internal(e.to_string()))?;
    let track_rel = format!("audio/discord/{discord_user_id}/track.ogg");
    let track_abs = session_dir.join(&track_rel);

    if input_paths.len() == 1 {
        if input_paths[0] != track_abs {
            let _ = fs::rename(&input_paths[0], &track_abs);
            if !track_abs.is_file() {
                fs::copy(&input_paths[0], &track_abs)
                    .map_err(|e| AppError::Internal(format!("copy track: {e}")))?;
            }
        }
    } else {
        concat_ogg_files(&input_paths, &track_abs)?;
    }

    let recording_id = Uuid::now_v7().to_string();
    let file_path = format!("sessions/{}/{}", session.number, track_rel);

    sqlx::query(
        r#"
        INSERT INTO recordings (
          id, session_id, user_discord_id, source_kind, file_path,
          duration_ms, sample_rate, channels, created_at, updated_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(&recording_id)
    .bind(&session.id)
    .bind(discord_user_id)
    .bind(source_kind)
    .bind(&file_path)
    .bind(total_duration)
    .bind(sample_rate)
    .bind(channels)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    for seg_id in segment_ids {
        sqlx::query(
            r#"
            UPDATE recording_segments
            SET status = 'superseded', consolidated_recording_id = ?, updated_at = ?
            WHERE id = ?
            "#,
        )
        .bind(&recording_id)
        .bind(now)
        .bind(&seg_id)
        .execute(pool)
        .await?;
    }

    let _ = (first_offset, _display_name);
    Ok(())
}

fn concat_ogg_files(inputs: &[PathBuf], output: &Path) -> AppResult<()> {
    let list_path = output.with_extension("concat.txt");
    let mut list_file =
        fs::File::create(&list_path).map_err(|e| AppError::Internal(e.to_string()))?;
    for path in inputs {
        let escaped = path.to_string_lossy().replace('\'', "'\\''");
        writeln!(list_file, "file '{escaped}'")
            .map_err(|e| AppError::Internal(e.to_string()))?;
    }
    drop(list_file);

    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            &list_path.to_string_lossy(),
            "-c",
            "copy",
            &output.to_string_lossy(),
        ])
        .status()
        .map_err(|e| AppError::Internal(format!("ffmpeg concat failed to start: {e}")))?;

    let _ = fs::remove_file(&list_path);

    if !status.success() {
        tracing::warn!(
            output = %output.display(),
            inputs = inputs.len(),
            code = ?status.code(),
            "ffmpeg concat failed; falling back to first valid chunk"
        );
        if let Some(first) = inputs.first() {
            fs::copy(first, output).map_err(|e| AppError::Internal(format!("copy fallback track: {e}")))?;
            return Ok(());
        }
        return Err(AppError::Internal(format!(
            "ffmpeg concat exited with {:?}",
            status.code()
        )));
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportManifestChunk {
    discord_user_id: String,
    display_name: String,
    relative_path: String,
    session_offset_ms: i64,
    duration_ms: i64,
    codec: &'static str,
    sample_rate: i32,
    channels: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportManifest {
    version: u8,
    session_id: String,
    source_kind: String,
    started_at: i64,
    ended_at: i64,
    channel_id: String,
    chunks: Vec<ExportManifestChunk>,
}

pub async fn export_manifest_from_db(
    pool: &SqlitePool,
    session: &Session,
    session_dir: &Path,
) -> AppResult<()> {
    let handoff_meta = read_handoff_metadata(session_dir);
    let rows: Vec<(String, String, String, i64, Option<i64>, Option<i32>, Option<i32>)> =
        sqlx::query_as(
            r#"
            SELECT r.user_discord_id, COALESCE(a.discord_display_name, r.user_discord_id),
                   r.file_path, 0, r.duration_ms, r.sample_rate, r.channels
            FROM recordings r
            LEFT JOIN session_discord_assignments a
              ON a.session_id = r.session_id AND a.discord_user_id = r.user_discord_id AND a.is_primary = 1
            WHERE r.session_id = ?
            ORDER BY r.user_discord_id
            "#,
        )
        .bind(&session.id)
        .fetch_all(pool)
        .await?;

    let mut chunks = Vec::new();
    for (user_id, display_name, file_path, offset, dur, sr, ch) in rows {
        let rel = file_path
            .strip_prefix(&format!("sessions/{}/", session.number))
            .unwrap_or(&file_path)
            .to_string();
        chunks.push(ExportManifestChunk {
            discord_user_id: user_id,
            display_name,
            relative_path: rel,
            session_offset_ms: offset,
            duration_ms: dur.unwrap_or(0),
            codec: "opus_ogg",
            sample_rate: sr.unwrap_or(48_000),
            channels: ch.unwrap_or(2),
        });
    }

    let export = ExportManifest {
        version: 2,
        session_id: session.id.clone(),
        source_kind: handoff_meta
            .as_ref()
            .map(|h| h.source_kind.clone())
            .unwrap_or_else(|| "discord_capture".to_string()),
        started_at: handoff_meta
            .as_ref()
            .and_then(|h| h.started_at)
            .or(session.started_at)
            .unwrap_or_else(now_ms),
        ended_at: handoff_meta
            .as_ref()
            .and_then(|h| h.ended_at)
            .or(session.ended_at)
            .unwrap_or_else(now_ms),
        channel_id: handoff_meta
            .as_ref()
            .and_then(|h| h.channel_id.clone())
            .unwrap_or_default(),
        chunks,
    };

    let path = session_manifest_path(session_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::Internal(e.to_string()))?;
    }
    let json = serde_json::to_string_pretty(&export).map_err(AppError::Serialization)?;
    fs::write(&path, json).map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}

pub async fn export_speaker_labels(
    pool: &SqlitePool,
    session_id: &str,
    session_dir: &Path,
) -> AppResult<()> {
    let rows: Vec<(String, String, String, Option<String>)> = sqlx::query_as(
        r#"
        SELECT a.discord_user_id, a.participant_role,
               COALESCE(c.name, a.discord_display_name, a.discord_user_id),
               a.character_id
        FROM session_discord_assignments a
        LEFT JOIN characters c ON c.id = a.character_id
        WHERE a.session_id = ? AND a.is_primary = 1
        "#,
    )
    .bind(session_id)
    .fetch_all(pool)
    .await?;

    let mut labels = serde_json::Map::new();
    for (discord_user_id, role, label, _) in rows {
        let speaker = if role == "gm" {
            GM_SPEAKER_LABEL.to_string()
        } else {
            label
        };
        labels.insert(discord_user_id, serde_json::Value::String(speaker));
    }

    let path = session_dir.join("transcripts").join("speaker-labels.json");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::Internal(e.to_string()))?;
    }
    let json = serde_json::to_string_pretty(&labels).map_err(AppError::Serialization)?;
    fs::write(&path, json).map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(())
}

pub async fn attribute_transcript_speakers(
    pool: &SqlitePool,
    session_id: &str,
    session_dir: &Path,
) -> AppResult<()> {
    let segments_path = session_dir.join("transcripts").join("segments.json");
    if !segments_path.is_file() {
        return Ok(());
    }

    let raw = fs::read_to_string(&segments_path).map_err(|e| AppError::Internal(e.to_string()))?;
    let mut payload: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| AppError::Internal(e.to_string()))?;

    let primary_rows: Vec<(String, String, Option<String>, Option<String>, i64)> = sqlx::query_as(
        r#"
        SELECT a.discord_user_id, a.participant_role,
               a.character_id, COALESCE(c.name, a.discord_display_name),
               (SELECT COUNT(*) FROM session_discord_assignments s2
                WHERE s2.session_id = a.session_id AND s2.discord_user_id = a.discord_user_id)
        FROM session_discord_assignments a
        LEFT JOIN characters c ON c.id = a.character_id
        WHERE a.session_id = ? AND a.is_primary = 1
        "#,
    )
    .bind(session_id)
    .fetch_all(pool)
    .await?;

    let mut by_user: std::collections::HashMap<String, (String, Option<String>, String, bool)> =
        std::collections::HashMap::new();
    for (discord_user_id, role, character_id, label, count) in primary_rows {
        let speaker = if role == "gm" {
            GM_SPEAKER_LABEL.to_string()
        } else {
            label.unwrap_or_else(|| discord_user_id.clone())
        };
        let ambiguous = count > 1 && role == "player";
        by_user.insert(discord_user_id, (role, character_id, speaker, ambiguous));
    }

    let Some(segments) = payload.get_mut("segments").and_then(|v| v.as_array_mut()) else {
        return Ok(());
    };

    for seg in segments {
        let Some(obj) = seg.as_object_mut() else {
            continue;
        };
        let discord_user_id = obj
            .get("sourceId")
            .and_then(|v| v.as_str())
            .map(|s| s.split(':').next().unwrap_or(s).to_string())
            .or_else(|| {
                obj.get("speaker")
                    .and_then(|v| v.as_str())
                    .map(str::to_string)
            });

        let Some(discord_user_id) = discord_user_id else {
            obj.insert(
                "attributionStatus".into(),
                serde_json::Value::String("unknown".into()),
            );
            continue;
        };

        let Some((role, character_id, speaker, ambiguous)) = by_user.get(&discord_user_id) else {
            obj.insert(
                "attributionStatus".into(),
                serde_json::Value::String("unknown".into()),
            );
            continue;
        };

        obj.insert("speaker".into(), serde_json::Value::String(speaker.clone()));
        if *ambiguous {
            obj.insert(
                "attributionStatus".into(),
                serde_json::Value::String("ambiguous".into()),
            );
        } else if role == "gm" {
            obj.insert(
                "attributionStatus".into(),
                serde_json::Value::String("resolved".into()),
            );
        } else if let Some(cid) = character_id {
            obj.insert(
                "attributedCharacterId".into(),
                serde_json::Value::String(cid.clone()),
            );
            obj.insert(
                "attributionStatus".into(),
                serde_json::Value::String("resolved".into()),
            );
        } else {
            obj.insert(
                "attributionStatus".into(),
                serde_json::Value::String("unknown".into()),
            );
        }
    }

    let json = serde_json::to_string_pretty(&payload).map_err(AppError::Serialization)?;
    fs::write(&segments_path, json).map_err(|e| AppError::Internal(e.to_string()))?;

    if let Ok(segments_vec) = serde_json::from_value::<Vec<crate::services::transcript_merge::SegmentLine>>(
        payload["segments"].clone(),
    ) {
        let merged = crate::services::transcript_merge::merge_segments(&segments_vec);
        let raw_path = session_dir.join("transcripts").join("raw-merged.txt");
        fs::write(&raw_path, merged).map_err(|e| AppError::Internal(e.to_string()))?;
    }

    Ok(())
}

pub fn gm_discord_user_id() -> Option<String> {
    discord_secrets::gm_discord_user_id()
}

fn read_handoff_metadata(session_dir: &Path) -> Option<RecordingManifest> {
    let path = session_manifest_path(session_dir);
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}
