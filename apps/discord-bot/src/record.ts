import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as readline from 'node:readline';
import type { Readable } from 'node:stream';

import { discordUserIdSchema, recordingManifestV2Schema } from '@amber/shared';
import { parsePlayLanguage } from '@amber/shared';
import {
  EndBehaviorType,
  entersState,
  joinVoiceChannel,
  VoiceConnectionStatus,
  type VoiceConnection,
} from '@discordjs/voice';
import { Client, GatewayIntentBits, type GuildMember, type VoiceBasedChannel } from 'discord.js';
import prism from 'prism-media';

import { validateChunk } from './chunk-validator.js';
import { ManifestBuilder } from './manifest-builder.js';
import { playRecordingAnnouncement } from './play-announcement.js';
import {
  CollisionTracker,
  chunkDirectoryPath,
  timestampChunkFileName,
} from './timestamp-chunk-naming.js';
import { WavWriter } from './wav-writer.js';

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
  wavWriter: WavWriter;
  opusStream: Readable;
  decoder: prism.opus.Decoder;
};

/**
 * Downmix stereo interleaved Int16 PCM to mono Int16 PCM.
 * Each stereo frame is 2 samples (left, right); output is (left + right) / 2.
 */
function downmixStereoToMono(stereoBuffer: Buffer): Buffer {
  const sampleCount = stereoBuffer.length / 2; // total Int16 samples (L+R interleaved)
  const frameCount = sampleCount / 2; // stereo frames
  const monoBuffer = Buffer.alloc(frameCount * 2); // one Int16 per frame

  for (let i = 0; i < frameCount; i++) {
    const left = stereoBuffer.readInt16LE(i * 4);
    const right = stereoBuffer.readInt16LE(i * 4 + 2);
    const mono = Math.round((left + right) / 2);
    monoBuffer.writeInt16LE(mono, i * 2);
  }

  return monoBuffer;
}

export async function runRecordSession(opts: RecordOptions): Promise<void> {
  const playLanguage = parsePlayLanguage(opts.locale);
  const audioDiscordDir = join(opts.outputDir, 'audio', 'discord');
  await mkdir(audioDiscordDir, { recursive: true });

  const sessionStartedAt = Date.now();
  const activeSegments = new Map<string, ActiveSegment>();
  const manifestBuilder = new ManifestBuilder();
  const collisionTracker = new CollisionTracker();
  const finalizeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const SPEAKING_END_DEBOUNCE_MS = 2000;
  const manifestPath = join(opts.outputDir, 'audio', 'manifest.json');

  // Merge existing manifest chunks if present
  try {
    const existingRaw = await readFile(manifestPath, 'utf8');
    const existing = recordingManifestV2Schema.parse(JSON.parse(existingRaw));
    manifestBuilder.mergeExisting(existing.chunks);
  } catch {
    // No prior manifest for this session.
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  let connection: VoiceConnection | null = null;
  let voiceChannel: VoiceBasedChannel | null = null;

  const clearFinalizeTimer = (userId: string): void => {
    const timer = finalizeTimers.get(userId);
    if (timer !== undefined) {
      clearTimeout(timer);
      finalizeTimers.delete(userId);
    }
  };

  const finalizeSegment = async (userId: string): Promise<void> => {
    clearFinalizeTimer(userId);
    const segment = activeSegments.get(userId);
    if (!segment) return;

    activeSegments.delete(userId);

    // Destroy the opus stream and decoder
    segment.opusStream.destroy();
    segment.decoder.destroy();

    try {
      const { bytesWritten } = await segment.wavWriter.finalize();

      // WavWriter already deletes files < 512 bytes
      if (bytesWritten === 0) {
        return;
      }

      // Run chunk validator for silence detection
      const validation = await validateChunk(segment.filePath);

      if (validation.status === 'silent') {
        console.log(
          `chunk discarded (silent, mean_volume=${validation.meanVolume} dB): ${segment.filePath}`,
        );
        await unlink(segment.filePath).catch(() => undefined);
        return;
      }

      if (validation.status === 'error') {
        // Treat as valid per requirement 4.5
        console.log(`chunk validation error (treating as valid): ${validation.reason}`);
      }

      const endTime = Date.now();
      manifestBuilder.addChunk({
        discordUserId: discordUserIdSchema.parse(segment.discordUserId),
        displayName: segment.displayName,
        relativePath: segment.relativePath,
        startTime: segment.wallStartedAt,
        endTime,
        sessionStartTime: sessionStartedAt,
      });
    } catch (err: unknown) {
      console.error(`failed to finalize chunk for ${userId}:`, err);
      await segment.wavWriter.abort().catch(() => undefined);
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

    const userDir = chunkDirectoryPath(opts.outputDir, userId);
    await mkdir(userDir, { recursive: true });

    const nowEpochSeconds = Math.floor(Date.now() / 1000);
    const collisionIndex = collisionTracker.nextIndex(userId, nowEpochSeconds);
    const fileName = timestampChunkFileName(nowEpochSeconds, collisionIndex);
    const filePath = join(userDir, fileName);
    const relativePath = `audio/discord/${userId}/${fileName}`;

    let wavWriter: WavWriter;
    try {
      wavWriter = new WavWriter(filePath, 48_000, 1, 16);
    } catch (err: unknown) {
      console.error(`failed to create WavWriter for ${userId}:`, err);
      return;
    }

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
      wavWriter,
      opusStream,
      decoder,
    };

    activeSegments.set(userId, segment);

    // Pipe opus stream through decoder, then listen for PCM data
    opusStream.pipe(decoder);

    decoder.on('data', (pcmChunk: Buffer) => {
      try {
        const monoData = downmixStereoToMono(pcmChunk);
        wavWriter.write(monoData);
      } catch (err: unknown) {
        // I/O error: abort writer, delete incomplete file, log, continue
        console.error(`write error for ${userId}, aborting chunk:`, err);
        segment.opusStream.destroy();
        segment.decoder.destroy();
        activeSegments.delete(userId);
        void wavWriter.abort().catch(() => undefined);
      }
    });

    decoder.on('error', (err: Error) => {
      console.error(`decoder error for ${userId}:`, err);
    });

    opusStream.on('error', (err: Error) => {
      console.error(`opus stream error for ${userId}:`, err);
    });
  };

  const scheduleFinalize = (userId: string): void => {
    clearFinalizeTimer(userId);
    const timer = setTimeout(() => {
      finalizeTimers.delete(userId);
      void finalizeSegment(userId);
    }, SPEAKING_END_DEBOUNCE_MS);
    finalizeTimers.set(userId, timer);
  };

  const onSpeakingStart = (userId: string): void => {
    if (userId === client.user?.id) return;
    clearFinalizeTimer(userId);
    void startSegment(userId);
  };

  const finish = async (): Promise<void> => {
    const endedAt = Date.now();
    for (const userId of finalizeTimers.keys()) {
      clearFinalizeTimer(userId);
    }
    await finalizeAllSegments();

    // Re-read existing manifest in case it was updated externally
    let manifestStartedAt = sessionStartedAt;
    try {
      const existingRaw = await readFile(manifestPath, 'utf8');
      const existing = recordingManifestV2Schema.parse(JSON.parse(existingRaw));
      manifestStartedAt = Math.min(manifestStartedAt, existing.startedAt);
      // Merge again in case another process wrote to it
      manifestBuilder.mergeExisting(existing.chunks);
    } catch {
      // No prior manifest or invalid — use this run only.
    }

    const chunks = manifestBuilder.build();

    const manifest = recordingManifestV2Schema.parse({
      version: 2,
      sessionId: opts.sessionId,
      sourceKind: 'discord_capture',
      startedAt: manifestStartedAt,
      endedAt,
      channelId: opts.channelId,
      chunks,
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
    if (userId === client.user?.id) return;
    scheduleFinalize(userId);
  });

  client.on('voiceStateUpdate', (_oldState, newState) => {
    if (newState.channelId !== voiceChannel?.id && activeSegments.has(newState.id)) {
      void finalizeSegment(newState.id);
    }
  });

  await stopPromise;
  await finish();
}
