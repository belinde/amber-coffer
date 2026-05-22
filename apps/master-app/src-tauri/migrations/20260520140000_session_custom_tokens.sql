-- Session-scoped custom tokens (not linked to vault NPCs/characters).
ALTER TABLE tokens ADD COLUMN session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE tokens ADD COLUMN display_name TEXT;
