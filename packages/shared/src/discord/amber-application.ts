/**
 * Amber Coffer product Discord Application (Developer Portal).
 * Used for: Master App user OAuth (setup wizard) and Player Activity Embedded App.
 *
 * Replace with the real Application ID after creating the app in the Discord portal.
 * @see docs/adr/0012-amber-discord-application.md
 */
export const AMBER_DISCORD_APPLICATION_ID = '1505870393007935598';

/** OAuth2 scopes for the campaign setup wizard (user login). */
export const AMBER_DISCORD_OAUTH_SCOPES = 'identify guilds';

/**
 * Bot invite permissions for the GM's recording bot (BYOB):
 * VIEW_CHANNEL (1024) | CONNECT (1048576) | SPEAK (2097152) = 3146752
 * @see GM_BOT_INVITE_PERMISSION_IDS in ./gm-bot-setup.ts
 */
export const GM_BOT_INVITE_PERMISSIONS = '3146752';

export const DISCORD_API_BASE = 'https://discord.com/api/v10';
export const DISCORD_OAUTH_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
export const DISCORD_OAUTH_TOKEN_URL = 'https://discord.com/api/oauth2/token';

/** Register this exact URI in the Amber Coffer Discord Application OAuth2 redirects. */
export const AMBER_DISCORD_OAUTH_REDIRECT_URI = 'http://127.0.0.1:47832/oauth/callback';
