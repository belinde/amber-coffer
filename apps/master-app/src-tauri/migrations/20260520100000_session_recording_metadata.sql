-- Recording segment staging + per-session Discord participant assignments.

CREATE TABLE recording_segments (
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
  consolidated_recording_id TEXT REFERENCES recordings(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_recording_segments_session ON recording_segments(session_id);
CREATE INDEX idx_recording_segments_session_user ON recording_segments(session_id, discord_user_id);

CREATE TABLE session_discord_assignments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  discord_display_name TEXT NOT NULL DEFAULT '',
  participant_role TEXT NOT NULL DEFAULT 'player',
  character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE INDEX idx_session_discord_assignments_session
  ON session_discord_assignments(session_id);
