import { createReadStream } from 'node:fs';

import { parsePlayLanguage } from '@amber/shared';
import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  type VoiceConnection,
} from '@discordjs/voice';
import { ChannelType, Routes, type Client } from 'discord.js';

import type { AnnouncementKind } from './announcement-copy.js';
import { resolveAnnouncementPath } from './announcement-path.js';

function isUnsupportedVoiceStateChannel(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const code: unknown = Reflect.get(err, 'code');
  return code === 50024;
}

async function setBotSelfMute(
  client: Client,
  connection: VoiceConnection,
  muted: boolean,
): Promise<void> {
  const userId = client.user?.id;
  if (!userId) return;

  const { channelId, guildId } = connection.joinConfig;
  if (!guildId || !channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel?.type === ChannelType.GuildStageVoice) {
    return;
  }

  try {
    await client.rest.patch(Routes.guildVoiceState(guildId, userId), {
      body: { self_mute: muted },
    });
  } catch (err: unknown) {
    if (isUnsupportedVoiceStateChannel(err)) return;
    console.warn('failed to set bot self mute:', err);
  }
}

export async function playRecordingAnnouncement(
  connection: VoiceConnection,
  client: Client,
  locale: string,
  kind: AnnouncementKind,
): Promise<void> {
  const playLanguage = parsePlayLanguage(locale);
  const { path } = resolveAnnouncementPath(playLanguage, kind);
  const player = createAudioPlayer();
  const resource = createAudioResource(createReadStream(path));
  const subscription = connection.subscribe(player);

  await setBotSelfMute(client, connection, false);
  player.play(resource);

  try {
    await entersState(player, AudioPlayerStatus.Playing, 10_000);
    await entersState(player, AudioPlayerStatus.Idle, 60_000);
  } finally {
    player.stop();
    subscription?.unsubscribe();
    await setBotSelfMute(client, connection, true);
  }
}
