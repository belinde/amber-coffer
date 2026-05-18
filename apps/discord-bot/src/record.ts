import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as readline from 'node:readline';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  discordUserIdSchema,
  recordingManifestV2Schema,
  type RecordingManifestChunk,
} from '@amber/shared';
import { parsePlayLanguage } from '@amber/shared';
import {
  EndBehaviorType,
  entersState,
  joinVoiceChannel,
  VoiceConnectionStatus,
  type VoiceConnection,
} from '@discordjs/voice';
import { Client, GatewayIntentBits, type GuildMember, type VoiceBasedChannel } from 'discord.js';
import ffmpegStatic from 'ffmpeg-static';
import prism from 'prism-media';

import { playRecordingAnnouncement } from './play-announcement.js';

type RecordOptions = {
  token: string;
  channelId: string;
  sessionId: string;
  outputDir: string;
  locale: string;
};

type ActiveSegment = {
  discordUserId: string;
  displayName: string;
  filePath: string;
  relativePath: string;
  sessionOffsetMs: number;
  wallStartedAt: number;
  ffmpegProc: ChildProcess;
  opusStream: Readable;
  decoder: prism.opus.Decoder;
};

type CompletedChunk = RecordingManifestChunk;

function ffmpegPath(): string {
  return typeof ffmpegStatic === 'string' ? ffmpegStatic : 'ffmpeg';
}

function chunkFileName(index: number): string {
  return `${String(index).padStart(4, '0')}.ogg`;
}

/** Opus-in-Ogg via ffmpeg; faster-whisper decodes via libav/ffmpeg. */
function spawnOggEncoder(outputPath: string): ChildProcess {
  return spawn(
    ffmpegPath(),
    [
      '-f',
      's16le',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-i',
      'pipe:0',
      '-c:a',
      'libopus',
      '-b:a',
      '64k',
      '-vbr',
      'on',
      '-application',
      'voip',
      '-y',
      outputPath,
    ],
    { stdio: ['pipe', 'ignore', 'inherit'] },
  );
}

async function closeOggEncoder(proc: ChildProcess): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    proc.on('error', (err: Error) => reject(err));
    proc.on('close', (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    if (proc.stdin) {
      proc.stdin.end();
    } else {
      reject(new Error('ffmpeg stdin missing'));
    }
  });
}

function isPrematureStreamClose(err: unknown): boolean {
  if (err === null || typeof err !== 'object' || !('code' in err)) return false;
  return String(Reflect.get(err, 'code')) === 'ERR_STREAM_PREMATURE_CLOSE';
}

function teardownPipeline(segment: ActiveSegment): void {
  segment.opusStream.destroy();
  segment.decoder.destroy();
}

export async function runRecordSession(opts: RecordOptions): Promise<void> {
  const playLanguage = parsePlayLanguage(opts.locale);
  const audioDiscordDir = join(opts.outputDir, 'audio', 'discord');
  await mkdir(audioDiscordDir, { recursive: true });

  const sessionStartedAt = Date.now();
  const activeSegments = new Map<string, ActiveSegment>();
  const completedChunks: CompletedChunk[] = [];
  const chunkCounters = new Map<string, number>();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  let connection: VoiceConnection | null = null;
  let voiceChannel: VoiceBasedChannel | null = null;

  const finalizeSegment = async (userId: string): Promise<void> => {
    const segment = activeSegments.get(userId);
    if (!segment) return;

    activeSegments.delete(userId);
    teardownPipeline(segment);

    try {
      await closeOggEncoder(segment.ffmpegProc);
      const durationMs = Math.max(0, Date.now() - segment.wallStartedAt);
      completedChunks.push({
        discordUserId: discordUserIdSchema.parse(segment.discordUserId),
        displayName: segment.displayName,
        relativePath: segment.relativePath,
        sessionOffsetMs: segment.sessionOffsetMs,
        durationMs,
        codec: 'opus_ogg',
        sampleRate: 48_000,
        channels: 2,
      });
    } catch (err: unknown) {
      console.error(`failed to finalize chunk for ${userId}:`, err);
    }
  };

  const finalizeAllSegments = async (): Promise<void> => {
    await Promise.all([...activeSegments.keys()].map((userId) => finalizeSegment(userId)));
  };

  const startSegment = async (userId: string): Promise<void> => {
    if (!voiceChannel || !connection) return;
    if (activeSegments.has(userId)) return;

    const member: GuildMember | undefined = voiceChannel.guild.members.cache.get(userId);
    const displayName = member?.displayName ?? member?.user.username ?? userId;
    const chunkIndex = chunkCounters.get(userId) ?? 0;
    chunkCounters.set(userId, chunkIndex + 1);

    const userDir = join(audioDiscordDir, userId);
    await mkdir(userDir, { recursive: true });

    const fileName = chunkFileName(chunkIndex);
    const filePath = join(userDir, fileName);
    const relativePath = `audio/discord/${userId}/${fileName}`;

    const ffmpegProc = spawnOggEncoder(filePath);
    const decoder = new prism.opus.Decoder({ rate: 48_000, channels: 2, frameSize: 960 });
    const opusStream = connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.Manual },
    });

    const wallStartedAt = Date.now();
    const segment: ActiveSegment = {
      discordUserId: userId,
      displayName,
      filePath,
      relativePath,
      sessionOffsetMs: wallStartedAt - sessionStartedAt,
      wallStartedAt,
      ffmpegProc,
      opusStream,
      decoder,
    };

    activeSegments.set(userId, segment);

    if (!ffmpegProc.stdin) {
      console.error(`ffmpeg stdin missing for ${userId}`);
      activeSegments.delete(userId);
      teardownPipeline(segment);
      return;
    }

    void pipeline(opusStream, decoder, ffmpegProc.stdin).catch((err: unknown) => {
      if (isPrematureStreamClose(err)) return;
      console.error(`pipeline error for ${userId}:`, err);
    });
  };

  const onSpeakingStart = (userId: string): void => {
    if (userId === client.user?.id) return;
    void (async () => {
      if (activeSegments.has(userId)) {
        await finalizeSegment(userId);
      }
      await startSegment(userId);
    })();
  };

  const finish = async (): Promise<void> => {
    const endedAt = Date.now();
    await finalizeAllSegments();

    let mergedChunks = completedChunks;
    let manifestStartedAt = sessionStartedAt;
    const manifestPath = join(opts.outputDir, 'audio', 'manifest.json');
    try {
      const existingRaw = await readFile(manifestPath, 'utf8');
      const existing = recordingManifestV2Schema.parse(JSON.parse(existingRaw));
      mergedChunks = [...existing.chunks, ...completedChunks];
      manifestStartedAt = Math.min(manifestStartedAt, existing.startedAt);
    } catch {
      // No prior manifest or invalid — use this run only.
    }

    const manifest = recordingManifestV2Schema.parse({
      version: 2,
      sessionId: opts.sessionId,
      sourceKind: 'discord_capture',
      startedAt: manifestStartedAt,
      endedAt,
      channelId: opts.channelId,
      chunks: mergedChunks,
    });

    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    if (connection) {
      try {
        await playRecordingAnnouncement(connection, client, playLanguage, 'recording-stop');
      } catch (err: unknown) {
        console.error('recording stop announcement failed:', err);
      }
      connection.destroy();
      connection = null;
    }
    void client.destroy();
  };

  let resolveStop!: () => void;
  const stopPromise = new Promise<void>((resolve) => {
    resolveStop = resolve;
  });

  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    if (line.trim().toLowerCase() === 'stop') {
      resolveStop();
    }
  });

  process.on('SIGTERM', () => resolveStop());

  await new Promise<void>((resolve, reject) => {
    client.once('ready', () => resolve());
    client.once('error', reject);
    void client.login(opts.token);
  });

  const channel = await client.channels.fetch(opts.channelId);
  if (!channel?.isVoiceBased()) {
    throw new Error(`Channel ${opts.channelId} is not a voice channel`);
  }

  const vc = channel;
  voiceChannel = vc;
  connection = joinVoiceChannel({
    channelId: vc.id,
    guildId: vc.guild.id,
    adapterCreator: vc.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: true,
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

  try {
    await playRecordingAnnouncement(connection, client, playLanguage, 'recording-start');
  } catch (err: unknown) {
    console.error('recording start announcement failed:', err);
  }

  const receiver = connection.receiver;
  receiver.speaking.on('start', onSpeakingStart);
  receiver.speaking.on('end', (userId) => {
    void finalizeSegment(userId);
  });

  client.on('voiceStateUpdate', (_oldState, newState) => {
    if (newState.channelId !== voiceChannel?.id && activeSegments.has(newState.id)) {
      void finalizeSegment(newState.id);
    }
  });

  await stopPromise;
  await finish();
}
