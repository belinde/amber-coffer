export type TokenPlayerColor = {
  background: string;
  border: string;
  label: string;
};

/** Default GM-only token (no assigned player controller). */
export const GM_TOKEN_COLOR: TokenPlayerColor = {
  background: '#8a7a50',
  border: '#6a5a38',
  label: '#f5f0e6',
};

/** Stable gold accent for the local player's own token in player-activity. */
export const OWNED_TOKEN_COLOR: TokenPlayerColor = {
  background: '#c9a227',
  border: '#f0e6c8',
  label: '#1a1612',
};

function hashStringToUint32(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Deterministic accent per Discord user id so all tokens controlled by the same player match.
 */
export function discordIdToTokenColor(discordId: string): TokenPlayerColor {
  const hue = hashStringToUint32(discordId.trim()) % 360;
  return {
    background: `hsl(${hue} 38% 42%)`,
    border: `hsl(${hue} 52% 68%)`,
    label: `hsl(${hue} 15% 96%)`,
  };
}

export function resolveTokenPlayerColor(args: {
  controlledByPlayerDiscordId: string | null | undefined;
}): TokenPlayerColor {
  const controller = args.controlledByPlayerDiscordId?.trim();
  if (!controller) {
    return GM_TOKEN_COLOR;
  }
  return discordIdToTokenColor(controller);
}

/** Inline CSS variables for `.tabletop-token` (spread into React `style`). */
export type TokenPlayerColorStyle = Record<string, string>;

export function tokenPlayerColorStyle(color: TokenPlayerColor): TokenPlayerColorStyle {
  return {
    '--tabletop-token-bg': color.background,
    '--tabletop-token-border': color.border,
    '--tabletop-token-label-color': color.label,
  };
}

export function tokenColorStyleForToken(args: {
  controlledByPlayerDiscordId: string | null | undefined;
}): TokenPlayerColorStyle {
  return tokenPlayerColorStyle(resolveTokenPlayerColor(args));
}
