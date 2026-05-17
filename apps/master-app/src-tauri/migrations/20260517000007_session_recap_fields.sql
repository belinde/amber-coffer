-- Session recap content (POC resoconti import)

ALTER TABLE sessions ADD COLUMN summary TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN events_body TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN gm_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN public_summary TEXT;
ALTER TABLE sessions ADD COLUMN locations_visited_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE sessions ADD COLUMN npcs_encountered_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE sessions ADD COLUMN played_at INTEGER;
