CREATE TABLE maps (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_path TEXT NOT NULL,
  width_px INTEGER NOT NULL,
  height_px INTEGER NOT NULL,
  grid_size_px INTEGER NOT NULL DEFAULT 50,
  grid_cols INTEGER NOT NULL DEFAULT 24,
  grid_rows INTEGER NOT NULL DEFAULT 18,
  bench_slots INTEGER NOT NULL DEFAULT 12,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

-- Tokens use cell coordinates with two zones (decision D1/D2 in
-- docs/migration/tabletop-porting-notes.md). The `zone` discriminator selects
-- which positional columns are meaningful; CHECK constraints keep the table
-- consistent across writes.
CREATE TABLE tokens (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  zone TEXT NOT NULL CHECK (zone IN ('board', 'bench')),
  x_cell INTEGER,
  y_cell INTEGER,
  bench_slot INTEGER,
  visible_to_players INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  CHECK (
    (zone = 'board' AND x_cell IS NOT NULL AND y_cell IS NOT NULL AND bench_slot IS NULL)
    OR
    (zone = 'bench' AND bench_slot IS NOT NULL AND x_cell IS NULL AND y_cell IS NULL)
  )
) STRICT;

CREATE TABLE fog_of_war (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  region_json TEXT NOT NULL,
  revealed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

-- Handouts: documents the Master shares with players during a session.
-- Persistent history per session; visibility flips on share/hide.
-- Decision D4 in docs/migration/tabletop-porting-notes.md.
CREATE TABLE handouts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  body TEXT,
  image_local_path TEXT,
  image_thumbnail_url TEXT,
  image_canon_url TEXT,
  image_hash TEXT,
  visible_to_players INTEGER NOT NULL DEFAULT 0,
  shown_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE INDEX idx_handouts_session ON handouts(session_id);
CREATE INDEX idx_tokens_map ON tokens(map_id);
