import {
  discordGuildMemberOptionSchema,
  discordGuildOptionSchema,
  discordOauthStatusSchema,
  discordVoiceChannelOptionSchema,
  type DiscordGuildMemberOption,
  type DiscordGuildOption,
  type DiscordOauthStatus,
  type DiscordVoiceChannelOption,
} from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';

export type {
  DiscordGuildMemberOption,
  DiscordGuildOption,
  DiscordOauthStatus,
  DiscordVoiceChannelOption,
};

export async function discordOauthStart(): Promise<void> {
  return invoke<void>('discord_oauth_start');
}

export async function discordOauthClear(): Promise<void> {
  return invoke<void>('discord_oauth_clear');
}

export async function discordOauthStatus(): Promise<DiscordOauthStatus> {
  const raw = await invoke<unknown>('discord_oauth_status');
  return discordOauthStatusSchema.parse(raw);
}

export async function discordOauthLogout(): Promise<void> {
  return invoke<void>('discord_oauth_logout');
}

export async function discordEnsureUserOauth(): Promise<void> {
  return invoke<void>('discord_ensure_user_oauth');
}

let adminGuildsInflight: Promise<DiscordGuildOption[]> | null = null;

export async function discordListAdminGuilds(): Promise<DiscordGuildOption[]> {
  if (adminGuildsInflight) return adminGuildsInflight;

  adminGuildsInflight = invoke<unknown[]>('discord_list_admin_guilds')
    .then((raw) => raw.map((row) => discordGuildOptionSchema.parse(row)))
    .finally(() => {
      adminGuildsInflight = null;
    });

  return adminGuildsInflight;
}

export async function discordListGuildMembers(
  guildId: string,
): Promise<DiscordGuildMemberOption[]> {
  const raw = await invoke<unknown[]>('discord_list_guild_members', { guildId });
  return raw.map((row) => discordGuildMemberOptionSchema.parse(row));
}

export async function discordSearchGuildMembers(
  guildId: string,
  query: string,
): Promise<DiscordGuildMemberOption[]> {
  const raw = await invoke<unknown[]>('discord_search_guild_members', { guildId, query });
  return raw.map((row) => discordGuildMemberOptionSchema.parse(row));
}

export async function discordOpenBotInvite(guildId: string): Promise<void> {
  return invoke<void>('discord_open_bot_invite', { guildId });
}

export async function discordIsBotInGuild(guildId: string): Promise<boolean> {
  return invoke<boolean>('discord_is_bot_in_guild', { guildId });
}

export async function discordListVoiceChannels(
  guildId: string,
): Promise<DiscordVoiceChannelOption[]> {
  const raw = await invoke<unknown[]>('discord_list_voice_channels', { guildId });
  return raw.map((row) => discordVoiceChannelOptionSchema.parse(row));
}

export async function discordParseBotApplicationId(token: string): Promise<string> {
  return invoke<string>('discord_parse_bot_application_id', { token });
}
