-- One tabletop token per vault entity per map.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_map_entity
  ON tokens (map_id, entity_kind, entity_id);
