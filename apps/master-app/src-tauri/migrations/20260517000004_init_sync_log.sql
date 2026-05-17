CREATE TABLE sync_sequence (
  campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  next_seq INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE sync_outbox (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  seq INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  enqueued_at INTEGER NOT NULL,
  published_at INTEGER,
  UNIQUE(campaign_id, seq)
) STRICT;
