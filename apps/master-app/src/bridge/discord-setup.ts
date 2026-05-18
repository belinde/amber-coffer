import {
  discordGuildOptionSchema,
  discordVoiceChannelOptionSchema,
  type DiscordGuildOption,
  type DiscordVoiceChannelOption,
} from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';

export type { DiscordGuildOption, DiscordVoiceChannelOption };

export async function discordOauthStart(): Promise<void> {
  return invoke<void>('discord_oauth_start');
}

export async function discordOauthClear(): Promise<void> {
  return invoke<void>('discord_oauth_clear');
}

export async function discordListAdminGuilds(): Promise<DiscordGuildOption[]> {
  const raw = await invoke<unknown[]>('discord_list_admin_guilds');
  return raw.map((row) => discordGuildOptionSchema.parse(row));
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
