import {
  sessionDiscordAssignmentSchema,
  sessionDiscordParticipantSchema,
  upsertSessionDiscordAssignmentInputSchema,
  type Session,
  type SessionDiscordAssignment,
  type SessionDiscordParticipant,
  type UpsertSessionDiscordAssignmentInput,
} from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

export type {
  SessionDiscordAssignment,
  SessionDiscordParticipant,
  UpsertSessionDiscordAssignmentInput,
};

const discordConnectedUserSchema = z.object({
  discordUserId: z.string().min(1),
  discordUsername: z.string().nullable().optional(),
});

export type DiscordConnectedUser = z.infer<typeof discordConnectedUserSchema>;

export async function listSessionDiscordParticipants(
  sessionId: Session['id'],
): Promise<SessionDiscordParticipant[]> {
  const raw = await invoke<unknown[]>('list_session_discord_participants', { sessionId });
  return raw.map((row) => sessionDiscordParticipantSchema.parse(row));
}

export async function upsertSessionDiscordAssignment(
  input: UpsertSessionDiscordAssignmentInput,
): Promise<SessionDiscordAssignment> {
  const payload = upsertSessionDiscordAssignmentInputSchema.parse(input);
  const raw = await invoke<unknown>('upsert_session_discord_assignment', { input: payload });
  return sessionDiscordAssignmentSchema.parse(raw);
}

export async function removeSessionDiscordAssignment(
  assignmentId: string,
  sessionId: Session['id'],
): Promise<void> {
  return invoke<void>('remove_session_discord_assignment', { assignmentId, sessionId });
}

export async function addSessionSharedAccountCharacter(
  sessionId: Session['id'],
  discordUserId: string,
  characterId: string,
): Promise<SessionDiscordAssignment> {
  const raw = await invoke<unknown>('add_session_shared_account_character', {
    sessionId,
    discordUserId,
    characterId,
  });
  return sessionDiscordAssignmentSchema.parse(raw);
}

export async function discordConnectedUser(): Promise<DiscordConnectedUser | null> {
  const raw: unknown = await invoke('discord_connected_user');
  if (raw === null) return null;
  return discordConnectedUserSchema.parse(raw);
}
