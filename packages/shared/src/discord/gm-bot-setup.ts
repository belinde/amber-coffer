/**
 * GM recording bot setup requirements (Developer Portal + guild invite).
 * Keep UI copy in apps/master-app i18n aligned with these ids.
 */

/** Privileged Gateway Intents — enable under Bot → Privileged Gateway Intents. */
export const GM_BOT_PRIVILEGED_INTENT_IDS = ['serverMembers'] as const;
export type GmBotPrivilegedIntentId = (typeof GM_BOT_PRIVILEGED_INTENT_IDS)[number];

/**
 * Bot permissions for guild invite ({@link GM_BOT_INVITE_PERMISSIONS}).
 * Names match the Discord OAuth2 URL Generator / invite UI (English).
 */
export const GM_BOT_INVITE_PERMISSION_IDS = ['viewChannel', 'connect', 'speak'] as const;
export type GmBotInvitePermissionId = (typeof GM_BOT_INVITE_PERMISSION_IDS)[number];

/** Privileged intents that Amber Coffer does not use — leave disabled. */
export const GM_BOT_DISABLED_INTENT_IDS = ['presence', 'messageContent'] as const;
export type GmBotDisabledIntentId = (typeof GM_BOT_DISABLED_INTENT_IDS)[number];
