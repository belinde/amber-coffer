import { z } from 'zod';

import { discordChannelIdSchema } from '../ids/schemas.js';

export const discordGuildOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  icon: z.string().nullable(),
  botPresent: z.boolean(),
});

export type DiscordGuildOption = z.infer<typeof discordGuildOptionSchema>;

export const discordVoiceChannelOptionSchema = z.object({
  id: discordChannelIdSchema,
  name: z.string(),
  parentId: z.string().nullable(),
  parentName: z.string().nullable(),
  kind: z.enum(['voice', 'stage']),
});

export type DiscordVoiceChannelOption = z.infer<typeof discordVoiceChannelOptionSchema>;

export const discordGuildMemberOptionSchema = z.object({
  id: z.string().min(1),
  username: z.string(),
  globalName: z.string().nullable(),
  nick: z.string().nullable(),
  avatar: z.string().nullable(),
  displayName: z.string(),
});

export type DiscordGuildMemberOption = z.infer<typeof discordGuildMemberOptionSchema>;

export const discordOauthStatusSchema = z.object({
  connected: z.boolean(),
  expiresAt: z.number().int().nullable().optional(),
  discordUserId: z.string().nullable().optional(),
  discordUsername: z.string().nullable().optional(),
});

export type DiscordOauthStatus = z.infer<typeof discordOauthStatusSchema>;
