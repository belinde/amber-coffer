import { sessionSchema, sessionStatusSchema, type Session } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

import { parseBridgeInput } from './parse-bridge-input.js';

type CampaignId = Session['campaignId'];
type SessionId = Session['id'];

const createSessionInputSchema = z.object({
  campaignId: z.string().min(1),
  number: z.number().int().positive().optional(),
  title: z.string().nullable().optional(),
  status: sessionStatusSchema.optional(),
  startedAt: z.number().int().nonnegative().nullable().optional(),
  endedAt: z.number().int().nonnegative().nullable().optional(),
});

const updateSessionInputSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().positive(),
  title: z.string().nullable().optional(),
  status: sessionStatusSchema,
  startedAt: z.number().int().nonnegative().nullable().optional(),
  endedAt: z.number().int().nonnegative().nullable().optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionInputSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionInputSchema>;

export { sessionStatusSchema };

function parse(raw: unknown): Session {
  return sessionSchema.parse(raw);
}

export async function listSessions(campaignId: CampaignId): Promise<Session[]> {
  const raw = await invoke<unknown[]>('list_sessions', { campaignId });
  return raw.map(parse);
}

export async function getSession(id: SessionId): Promise<Session | null> {
  const raw: unknown = await invoke('get_session', { id });
  return raw === null ? null : parse(raw);
}

export async function createSession(input: CreateSessionInput): Promise<Session> {
  const payload = parseBridgeInput(createSessionInputSchema, input);
  const raw = await invoke<unknown>('create_session', { input: payload });
  return parse(raw);
}

export async function updateSession(input: UpdateSessionInput): Promise<Session> {
  const payload = parseBridgeInput(updateSessionInputSchema, input);
  const raw = await invoke<unknown>('update_session', { input: payload });
  return parse(raw);
}

export async function deleteSession(id: SessionId): Promise<void> {
  return invoke<void>('delete_session', { id });
}
