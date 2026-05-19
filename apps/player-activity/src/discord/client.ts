import { AMBER_DISCORD_APPLICATION_ID } from '@amber/shared';
import { DiscordSDK } from '@discord/embedded-app-sdk';

import { setupDiscordApiProxyMappings } from './proxy-mappings.js';

/** Discord API channel type: 2 = guild voice (GUILD_VOICE). */
export const DISCORD_GUILD_VOICE_CHANNEL_TYPE = 2;

export type DiscordReadyContext = {
  readonly embedded: boolean;
  readonly discordSdk: DiscordSDK | null;
  readonly channelId: string | null;
  /** False for DM / text channels — Activity handshake requires a voice channel. */
  readonly isVoiceChannel: boolean;
  /** Discord user id when authenticated inside the Activity iframe. */
  readonly participantId: string | null;
};

/** True when running inside the Discord Activity iframe (not standalone Vite). */
export function isDiscordEmbedded(): boolean {
  return typeof window !== 'undefined' && window.parent !== window;
}

/**
 * Initializes the Discord Embedded App SDK when running inside an Activity iframe.
 * Returns null in standalone Vite dev (no iframe).
 */
export async function initDiscordActivity(
  clientId: string = AMBER_DISCORD_APPLICATION_ID,
): Promise<DiscordReadyContext | null> {
  if (!isDiscordEmbedded()) {
    return null;
  }

  const discordSdk = new DiscordSDK(clientId);
  await discordSdk.ready();
  setupDiscordApiProxyMappings();

  const channelId = discordSdk.channelId;
  let isVoiceChannel = channelId != null;
  if (channelId) {
    try {
      const channel = await discordSdk.commands.getChannel({ channel_id: channelId });
      isVoiceChannel = channel.type === DISCORD_GUILD_VOICE_CHANNEL_TYPE;
    } catch {
      // Missing guilds scope or RPC error: let handshake report channel_not_linked if needed.
    }
  }

  return {
    embedded: true,
    discordSdk,
    channelId,
    isVoiceChannel,
    participantId: null,
  };
}

export function createDiscordClient(clientId: string = AMBER_DISCORD_APPLICATION_ID): {
  clientId: string;
  isEmbedded: () => boolean;
} {
  return {
    clientId,
    isEmbedded: isDiscordEmbedded,
  };
}
