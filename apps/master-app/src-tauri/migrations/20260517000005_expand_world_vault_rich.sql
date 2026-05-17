-- Rich world vault fields (entity-templates.md)

ALTER TABLE characters ADD COLUMN species TEXT;
ALTER TABLE characters ADD COLUMN role_hint TEXT;
ALTER TABLE characters ADD COLUMN game_system_hint TEXT;
ALTER TABLE characters ADD COLUMN gm_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE characters ADD COLUMN visibility TEXT NOT NULL DEFAULT 'gm_only';
ALTER TABLE characters ADD COLUMN appearance_json TEXT NOT NULL DEFAULT '{"description":"","permanentMarks":[],"visualReference":{"prompt":""}}';
ALTER TABLE characters ADD COLUMN game_stats_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE characters ADD COLUMN notable_equipment_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE characters ADD COLUMN events_interesting_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE characters ADD COLUMN image_ref_json TEXT;

UPDATE characters SET game_stats_json = attributes_json WHERE game_stats_json = '{}';

ALTER TABLE npcs ADD COLUMN species TEXT;
ALTER TABLE npcs ADD COLUMN role_hint TEXT;
ALTER TABLE npcs ADD COLUMN region TEXT;
ALTER TABLE npcs ADD COLUMN scope TEXT;
ALTER TABLE npcs ADD COLUMN reminder TEXT;
ALTER TABLE npcs ADD COLUMN record_kind TEXT NOT NULL DEFAULT 'canonical';
ALTER TABLE npcs ADD COLUMN game_system_hint TEXT;
ALTER TABLE npcs ADD COLUMN gm_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE npcs ADD COLUMN visibility TEXT NOT NULL DEFAULT 'gm_only';
ALTER TABLE npcs ADD COLUMN appearance_json TEXT NOT NULL DEFAULT '{"description":"","permanentMarks":[],"visualReference":{"prompt":""}}';
ALTER TABLE npcs ADD COLUMN game_stats_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE npcs ADD COLUMN notable_equipment_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE npcs ADD COLUMN links_to_characters_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE npcs ADD COLUMN events_interesting_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE npcs ADD COLUMN image_ref_json TEXT;

UPDATE npcs SET game_stats_json = attributes_json WHERE game_stats_json = '{}';

ALTER TABLE locations ADD COLUMN region TEXT;
ALTER TABLE locations ADD COLUMN population TEXT;
ALTER TABLE locations ADD COLUMN visibility TEXT NOT NULL DEFAULT 'gm_only';
ALTER TABLE locations ADD COLUMN appearance_json TEXT NOT NULL DEFAULT '{"description":"","permanentMarks":[],"visualReference":{"prompt":""}}';
ALTER TABLE locations ADD COLUMN sections_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE locations ADD COLUMN events_interesting_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE locations ADD COLUMN image_ref_json TEXT;

ALTER TABLE factions ADD COLUMN faction_kind TEXT;
ALTER TABLE factions ADD COLUMN parent_faction_id TEXT REFERENCES factions(id);
ALTER TABLE factions ADD COLUMN goals TEXT NOT NULL DEFAULT '';
ALTER TABLE factions ADD COLUMN secrets TEXT NOT NULL DEFAULT '';
ALTER TABLE factions ADD COLUMN visibility TEXT NOT NULL DEFAULT 'gm_only';
ALTER TABLE factions ADD COLUMN events_interesting_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE factions ADD COLUMN image_ref_json TEXT;

CREATE TABLE lore_notes (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
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
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
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

CREATE INDEX idx_lore_notes_campaign ON lore_notes(campaign_id);
CREATE INDEX idx_narrative_seeds_campaign ON narrative_seeds(campaign_id);
CREATE INDEX idx_narrative_seeds_status ON narrative_seeds(campaign_id, status);
