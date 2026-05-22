-- Player-visible map background URL path (relative, served from table CloudFront /session-assets).
ALTER TABLE maps ADD COLUMN background_public_path TEXT NOT NULL DEFAULT '';
