import { createReadStream } from 'node:fs';

import { parsePlayLanguage } from '@amber/shared';
import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  type VoiceConnection,
} from '@discordjs/voice';
import { Routes, type Client } from 'discord.js';

import type { AnnouncementKind } from './announcement-copy.js';
import { resolveAnnouncementPath } from './announcement-path.js';

async function setBotSelfMute(client: Client, guildId: string, muted: boolean): Promise<void> {
  const userId = client.user?.id;
  if (!userId) return;
  try {
    await client.rest.patch(Routes.guildVoiceState(guildId, userId), {
      body: { self_mute: muted },
    });
  } catch (err: unknown) {
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
  const guildId = connection.joinConfig.guildId;

  const player = createAudioPlayer();
  const resource = createAudioResource(createReadStream(path));
  const subscription = connection.subscribe(player);

  await setBotSelfMute(client, guildId, false);
  player.play(resource);

  try {
    await entersState(player, AudioPlayerStatus.Playing, 10_000);
    await entersState(player, AudioPlayerStatus.Idle, 60_000);
  } finally {
    player.stop();
    subscription?.unsubscribe();
    await setBotSelfMute(client, guildId, true);
  }
}
