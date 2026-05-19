-- Discord player linking: one Discord user per campaign character mapping.

CREATE UNIQUE INDEX IF NOT EXISTS idx_characters_campaign_player_discord
  ON characters(campaign_id, player_discord_id)
  WHERE player_discord_id IS NOT NULL;
