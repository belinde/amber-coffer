-- Allow replacing session recordings without FK violations from prior ingest rows.
-- SQLite cannot ALTER FK; recreate recording_segments with ON DELETE SET NULL.

PRAGMA foreign_keys = OFF;

CREATE TABLE recording_segments_new (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  discord_display_name TEXT NOT NULL DEFAULT '',
  relative_path TEXT NOT NULL,
  session_offset_ms INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  sample_rate INTEGER,
  channels INTEGER,
  status TEXT NOT NULL DEFAULT 'raw',
  consolidated_recording_id TEXT REFERENCES recordings(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

INSERT INTO recording_segments_new (
  id, session_id, discord_user_id, discord_display_name, relative_path,
  session_offset_ms, duration_ms, sample_rate, channels, status,
  consolidated_recording_id, created_at, updated_at
)
SELECT
  id, session_id, discord_user_id, discord_display_name, relative_path,
  session_offset_ms, duration_ms, sample_rate, channels, status,
  consolidated_recording_id, created_at, updated_at
FROM recording_segments;

DROP TABLE recording_segments;

ALTER TABLE recording_segments_new RENAME TO recording_segments;

CREATE INDEX IF NOT EXISTS idx_recording_segments_session ON recording_segments(session_id);
CREATE INDEX IF NOT EXISTS idx_recording_segments_session_user ON recording_segments(session_id, discord_user_id);

PRAGMA foreign_keys = ON;
