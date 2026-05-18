import { sessionPlayStateSchema, sessionStatusSchema, type Session } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

import { parseBridgeInput } from './parse-bridge-input.js';
import { parseSession } from './parse-session.js';

type CampaignId = Session['campaignId'];
type SessionId = Session['id'];

const createSessionInputSchema = z.object({
  campaignId: z.string().min(1),
  number: z.number().int().positive().optional(),
  title: z.string().nullable().optional(),
  status: sessionStatusSchema.optional(),
});

const updateSessionInputSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().positive(),
  title: z.string().nullable().optional(),
  status: sessionStatusSchema,
  startedAt: z.number().int().nonnegative().nullable().optional(),
  endedAt: z.number().int().nonnegative().nullable().optional(),
});

const updateSessionPrepInputSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().positive(),
  title: z.string().nullable().optional(),
  status: sessionStatusSchema,
  startedAt: z.number().int().nonnegative().nullable().optional(),
  endedAt: z.number().int().nonnegative().nullable().optional(),
  gmNotes: z.string().optional(),
  locationsVisited: z.array(z.string()).optional(),
  npcsEncountered: z.array(z.string()).optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionInputSchema>;
export type UpdateSessionPrepInput = z.infer<typeof updateSessionPrepInputSchema>;

export { sessionPlayStateSchema, sessionStatusSchema };

export async function listSessions(campaignId: CampaignId): Promise<Session[]> {
  const raw = await invoke<unknown[]>('list_sessions', { campaignId });
  return raw.map(parseSession);
}

export async function getSession(id: SessionId): Promise<Session | null> {
  const raw: unknown = await invoke('get_session', { id });
  return raw === null ? null : parseSession(raw);
}

export async function createSession(input: CreateSessionInput): Promise<Session> {
  const payload = parseBridgeInput(createSessionInputSchema, input);
  const raw = await invoke<unknown>('create_session', { input: payload });
  return parseSession(raw);
}

export async function updateSession(input: UpdateSessionInput): Promise<Session> {
  const payload = parseBridgeInput(updateSessionInputSchema, input);
  const existing = await getSession(payload.id as SessionId);
  if (!existing) {
    throw new Error('session not found');
  }
  const raw = await invoke<unknown>('update_session', {
    input: {
      ...payload,
      summary: existing.summary,
      eventsBody: existing.eventsBody,
      gmNotes: existing.gmNotes,
      publicSummary: existing.publicSummary,
      locationsVisitedJson: JSON.stringify(existing.locationsVisited),
      npcsEncounteredJson: JSON.stringify(existing.npcsEncountered),
      playedAt: existing.playedAt,
    },
  });
  return parseSession(raw);
}

export async function updateSessionPrep(input: UpdateSessionPrepInput): Promise<Session> {
  const payload = parseBridgeInput(updateSessionPrepInputSchema, input);
  const existing = await getSession(payload.id as SessionId);
  if (!existing) {
    throw new Error('session not found');
  }
  const raw = await invoke<unknown>('update_session', {
    input: {
      id: payload.id,
      number: payload.number,
      title: payload.title ?? existing.title,
      status: payload.status,
      startedAt: payload.startedAt ?? existing.startedAt,
      endedAt: payload.endedAt ?? existing.endedAt,
      summary: existing.summary,
      eventsBody: existing.eventsBody,
      gmNotes: payload.gmNotes ?? existing.gmNotes,
      publicSummary: existing.publicSummary,
      locationsVisitedJson: JSON.stringify(payload.locationsVisited ?? existing.locationsVisited),
      npcsEncounteredJson: JSON.stringify(payload.npcsEncountered ?? existing.npcsEncountered),
      playedAt: existing.playedAt,
    },
  });
  return parseSession(raw);
}

export async function beginSessionPlay(sessionId: SessionId): Promise<Session> {
  const raw = await invoke<unknown>('session_begin_play', { sessionId });
  return parseSession(raw);
}

export async function endSessionPlay(sessionId: SessionId): Promise<Session> {
  const raw = await invoke<unknown>('session_end_play', { sessionId });
  return parseSession(raw);
}

export async function deleteSession(id: SessionId): Promise<void> {
  return invoke<void>('delete_session', { id });
}
