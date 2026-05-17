ALTER TABLE recordings ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'discord_capture';

ALTER TABLE transcripts ADD COLUMN raw_transcript_path TEXT;
