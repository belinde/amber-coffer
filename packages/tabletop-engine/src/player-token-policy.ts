import type { DiscordUserId, Token } from '@amber/shared';

/**
 * Whether the Player Activity user may drag this token.
 * Control is token-scoped (PG or NPC summon delegated by the GM).
 */
export function canPlayerMoveToken(
  token: Token,
  playerDiscordId: DiscordUserId | string | null | undefined,
): boolean {
  if (playerDiscordId == null || playerDiscordId === '') {
    return false;
  }
  if (!token.visibleToPlayers) {
    return false;
  }
  return token.controlledByPlayerDiscordId === playerDiscordId;
}
