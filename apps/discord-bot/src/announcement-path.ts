import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_PLAY_LANGUAGE, playLanguageSchema, type PlayLanguage } from '@amber/shared';

import type { AnnouncementKind } from './announcement-copy.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export function announcementsAssetsRoot(): string {
  return join(packageRoot, 'assets', 'announcements');
}

export function announcementFileName(kind: AnnouncementKind): string {
  return `${kind}.ogg`;
}

export function resolveAnnouncementPath(
  locale: string,
  kind: AnnouncementKind,
): { path: string; locale: PlayLanguage } {
  const parsed = playLanguageSchema.safeParse(locale);
  const candidates: PlayLanguage[] = [];
  if (parsed.success) {
    candidates.push(parsed.data);
  }
  if (!candidates.includes('en')) {
    candidates.push('en');
  }
  if (!candidates.includes(DEFAULT_PLAY_LANGUAGE)) {
    candidates.push(DEFAULT_PLAY_LANGUAGE);
  }

  const root = announcementsAssetsRoot();
  for (const loc of candidates) {
    const path = join(root, loc, announcementFileName(kind));
    if (existsSync(path)) {
      return { path, locale: loc };
    }
  }

  throw new Error(
    `recording announcement asset not found for kind=${kind} (tried ${candidates.join(', ')})`,
  );
}
