import type { Session } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

import { parseBridgeInput } from './parse-bridge-input.js';
import { parseSession } from './parse-session.js';

type SessionId = Session['id'];

const sessionPipelineStateSchema = z.object({
  sessionId: z.string().min(1),
  status: z.string().min(1),
  recordingActive: z.boolean(),
  transcriptionActive: z.boolean(),
  transcriptionProgress: z.number().min(0).max(1).nullable(),
  hasBotToken: z.boolean(),
  sessionDir: z.string().nullable(),
  hasManifest: z.boolean(),
  hasRawTranscript: z.boolean(),
  hasRefinedTranscript: z.boolean(),
  transcriptionAttempted: z.boolean(),
  recordingCount: z.number().int().nonnegative(),
  participantCount: z.number().int().nonnegative(),
  playerParticipantCount: z.number().int().nonnegative(),
});

export type SessionPipelineState = z.infer<typeof sessionPipelineStateSchema>;

export async function setDiscordBotToken(token: string): Promise<void> {
  return invoke<void>('set_discord_bot_token', { token });
}

export async function hasDiscordBotToken(): Promise<boolean> {
  return invoke<boolean>('has_discord_bot_token');
}

export async function sessionStartRecording(sessionId: SessionId): Promise<Session> {
  const raw = await invoke<unknown>('session_start_recording', { sessionId });
  return parseSession(raw);
}

export async function sessionStopRecording(sessionId: SessionId): Promise<Session> {
  const raw = await invoke<unknown>('session_stop_recording', { sessionId });
  return parseSession(raw);
}

export async function sessionRunTranscription(sessionId: SessionId): Promise<Session> {
  const raw = await invoke<unknown>('session_run_transcription', { sessionId });
  return parseSession(raw);
}

export async function getSessionPipelineState(sessionId: SessionId): Promise<SessionPipelineState> {
  const raw = await invoke<unknown>('get_session_pipeline_state', { sessionId });
  return parseBridgeInput(sessionPipelineStateSchema, raw);
}
