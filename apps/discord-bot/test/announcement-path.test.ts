import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  announcementFileName,
  announcementsAssetsRoot,
  resolveAnnouncementPath,
} from '../src/announcement-path.js';

describe('resolveAnnouncementPath', () => {
  it('resolves known locale file when assets exist', () => {
    const root = announcementsAssetsRoot();
    const kind = 'recording-start';
    const itPath = `${root}/it/${announcementFileName(kind)}`;
    if (!existsSync(itPath)) {
      return;
    }
    const { path, locale } = resolveAnnouncementPath('it', kind);
    expect(locale).toBe('it');
    expect(path).toBe(itPath);
  });

  it('falls back to en for unknown locale', () => {
    const root = announcementsAssetsRoot();
    const kind = 'recording-stop';
    const enPath = `${root}/en/${announcementFileName(kind)}`;
    if (!existsSync(enPath)) {
      return;
    }
    const { path, locale } = resolveAnnouncementPath('xx', kind);
    expect(locale).toBe('en');
    expect(path).toBe(enPath);
  });
});
