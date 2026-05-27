-- Migration: add clip_region and sync tracking

-- Clip region stored on the CampaignImage (defines the token portrait crop)
ALTER TABLE campaign_images ADD COLUMN clip_region_json TEXT;

-- Sync tracking on campaign_images
ALTER TABLE campaign_images ADD COLUMN s3_etag TEXT;
ALTER TABLE campaign_images ADD COLUMN last_uploaded_hash TEXT;

-- Campaign-level sync timestamp
CREATE TABLE image_sync_state (
    campaign_id TEXT PRIMARY KEY,
    last_synced_at INTEGER,
    last_sync_status TEXT NOT NULL DEFAULT 'never'
) STRICT;
