-- Player Activity: which Discord user may drag this token (PG or delegated NPC summon).
ALTER TABLE tokens ADD COLUMN controlled_by_discord_id TEXT NULL;
