import { z } from 'zod';

import {
  characterIdSchema,
  discordUserIdSchema,
  sessionDiscordAssignmentIdSchema,
  sessionIdSchema,
} from '../ids/schemas.js';

export const participantRoleSchema = z.enum(['gm', 'player']);

export type ParticipantRole = z.infer<typeof participantRoleSchema>;

export const sessionDiscordAssignmentSchema = z.object({
  id: sessionDiscordAssignmentIdSchema,
  sessionId: sessionIdSchema,
  discordUserId: discordUserIdSchema,
  discordDisplayName: z.string(),
  participantRole: participantRoleSchema,
  characterId: characterIdSchema.nullable(),
  characterName: z.string().nullable(),
  isPrimary: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
});

export type SessionDiscordAssignment = z.infer<typeof sessionDiscordAssignmentSchema>;

export const sessionDiscordParticipantSchema = z.object({
  discordUserId: discordUserIdSchema,
  displayName: z.string(),
  participantRole: participantRoleSchema,
  isGm: z.boolean(),
  totalDurationMs: z.number().int().nonnegative(),
  segmentCount: z.number().int().nonnegative(),
  defaultCharacterId: characterIdSchema.nullable(),
  defaultCharacterName: z.string().nullable(),
  assignments: z.array(sessionDiscordAssignmentSchema),
});

export type SessionDiscordParticipant = z.infer<typeof sessionDiscordParticipantSchema>;

export const upsertSessionDiscordAssignmentInputSchema = z.object({
  sessionId: sessionIdSchema,
  discordUserId: discordUserIdSchema,
  discordDisplayName: z.string().optional(),
  participantRole: participantRoleSchema.optional(),
  characterId: characterIdSchema.nullable().optional(),
  isPrimary: z.boolean().optional(),
});

export type UpsertSessionDiscordAssignmentInput = z.infer<
  typeof upsertSessionDiscordAssignmentInputSchema
>;
