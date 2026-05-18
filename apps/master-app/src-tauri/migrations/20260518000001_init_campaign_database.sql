-- Per-campaign SQLite schema (squashed). Campaign metadata lives in campaign.json.

CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  parent_id TEXT REFERENCES locations(id),
  name TEXT NOT NULL,
  kind TEXT,
  description TEXT,
  coordinates_json TEXT,
  region TEXT,
  population TEXT,
  visibility TEXT NOT NULL DEFAULT 'gm_only',
  appearance_json TEXT NOT NULL DEFAULT '{"description":"","permanentMarks":[],"visualReference":{"prompt":""}}',
  sections_json TEXT NOT NULL DEFAULT '[]',
  events_interesting_json TEXT NOT NULL DEFAULT '[]',
  image_ref_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE factions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  alignment TEXT,
  description TEXT,
  headquarters_location_id TEXT REFERENCES locations(id),
  faction_kind TEXT,
  parent_faction_id TEXT REFERENCES factions(id),
  goals TEXT NOT NULL DEFAULT '',
  secrets TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'gm_only',
  events_interesting_json TEXT NOT NULL DEFAULT '[]',
  image_ref_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  player_discord_id TEXT,
  current_location_id TEXT REFERENCES locations(id),
  species TEXT,
  role_hint TEXT,
  game_system_hint TEXT,
  gm_notes TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'gm_only',
  appearance_json TEXT NOT NULL DEFAULT '{"description":"","permanentMarks":[],"visualReference":{"prompt":""}}',
  game_stats_json TEXT NOT NULL DEFAULT '{}',
  notable_equipment_json TEXT NOT NULL DEFAULT '[]',
  events_interesting_json TEXT NOT NULL DEFAULT '[]',
  image_ref_json TEXT,
  attributes_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE npcs (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  current_location_id TEXT REFERENCES locations(id),
  faction_id TEXT REFERENCES factions(id),
  species TEXT,
  role_hint TEXT,
  region TEXT,
  scope TEXT,
  reminder TEXT,
  record_kind TEXT NOT NULL DEFAULT 'canonical',
  game_system_hint TEXT,
  gm_notes TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'gm_only',
  appearance_json TEXT NOT NULL DEFAULT '{"description":"","permanentMarks":[],"visualReference":{"prompt":""}}',
  game_stats_json TEXT NOT NULL DEFAULT '{}',
  notable_equipment_json TEXT NOT NULL DEFAULT '[]',
  links_to_characters_json TEXT NOT NULL DEFAULT '[]',
  events_interesting_json TEXT NOT NULL DEFAULT '[]',
  image_ref_json TEXT,
  attributes_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'alive',
  disposition TEXT,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT,
  rarity TEXT,
  description TEXT,
  owner_kind TEXT,
  owner_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  from_kind TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_kind TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  strength INTEGER NOT NULL DEFAULT 0,
  bidirectional INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT,
  play_state TEXT NOT NULL DEFAULT 'preparing',
  status TEXT NOT NULL DEFAULT 'planned',
  started_at INTEGER,
  ended_at INTEGER,
  summary TEXT NOT NULL DEFAULT '',
  events_body TEXT NOT NULL DEFAULT '',
  gm_notes TEXT NOT NULL DEFAULT '',
  public_summary TEXT,
  locations_visited_json TEXT NOT NULL DEFAULT '[]',
  npcs_encountered_json TEXT NOT NULL DEFAULT '[]',
  played_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE recordings (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_discord_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'discord_capture',
  duration_ms INTEGER,
  sample_rate INTEGER,
  channels INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE transcripts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  source_recording_id TEXT REFERENCES recordings(id),
  raw_text TEXT,
  raw_transcript_path TEXT,
  refined_text TEXT,
  stt_model TEXT,
  llm_model TEXT,
  processed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE canon_diffs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_path TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT NOT NULL,
  rationale TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at INTEGER,
  reviewed_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE maps (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
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

CREATE TABLE handouts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
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

CREATE TABLE lore_notes (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'concept',
  body TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'gm_only',
  linked_entities_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE narrative_seeds (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'idea',
  body TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  linked_entities_json TEXT NOT NULL DEFAULT '[]',
  first_session_id TEXT REFERENCES sessions(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE campaign_images (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  title TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  image_ref_json TEXT,
  visibility TEXT NOT NULL DEFAULT 'gm_only',
  links_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE sync_sequence (
  campaign_id TEXT PRIMARY KEY,
  next_seq INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE sync_outbox (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  seq INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  enqueued_at INTEGER NOT NULL,
  published_at INTEGER,
  UNIQUE(campaign_id, seq)
) STRICT;

CREATE INDEX idx_characters_campaign ON characters(campaign_id);
CREATE INDEX idx_npcs_campaign ON npcs(campaign_id);
CREATE INDEX idx_locations_campaign_parent ON locations(campaign_id, parent_id);
CREATE INDEX idx_relationships_from ON relationships(campaign_id, from_kind, from_id);
CREATE INDEX idx_relationships_to ON relationships(campaign_id, to_kind, to_id);
CREATE INDEX idx_lore_notes_campaign ON lore_notes(campaign_id);
CREATE INDEX idx_narrative_seeds_campaign ON narrative_seeds(campaign_id);
CREATE INDEX idx_narrative_seeds_status ON narrative_seeds(campaign_id, status);
CREATE INDEX idx_campaign_images_campaign ON campaign_images(campaign_id);
CREATE INDEX idx_handouts_session ON handouts(session_id);
CREATE INDEX idx_tokens_map ON tokens(map_id);

CREATE UNIQUE INDEX idx_sessions_one_live_per_campaign
  ON sessions(campaign_id)
  WHERE play_state = 'live';
