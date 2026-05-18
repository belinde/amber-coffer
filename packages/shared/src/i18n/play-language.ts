import { z } from 'zod';

/** Language in which a campaign is played (Discord announcements, STT hint). */
export const PLAY_LANGUAGES = ['it', 'en', 'fr', 'es'] as const;

export const playLanguageSchema = z.enum(PLAY_LANGUAGES);

export type PlayLanguage = z.infer<typeof playLanguageSchema>;

export const DEFAULT_PLAY_LANGUAGE: PlayLanguage = 'it';

export function parsePlayLanguage(value: unknown): PlayLanguage {
  const parsed = playLanguageSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_PLAY_LANGUAGE;
}
