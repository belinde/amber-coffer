CREATE TABLE campaign_images (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  image_ref_json TEXT,
  visibility TEXT NOT NULL DEFAULT 'gm_only',
  links_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE INDEX idx_campaign_images_campaign ON campaign_images(campaign_id);
