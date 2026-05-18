import type { Session } from '@amber/shared';
import type { TFunction } from 'i18next';

import { formatSessionDateTime } from './session-datetime-display.js';

export function formatSessionDatesSummary(session: Session, t: TFunction, locale?: string): string {
  if (session.startedAt === null) {
    return t('sessionDetail.datesNotStarted');
  }
  const start = formatSessionDateTime(session.startedAt, locale);
  if (session.endedAt === null) {
    return t('sessionDetail.datesInProgress', { start });
  }
  const end = formatSessionDateTime(session.endedAt, locale);
  return t('sessionDetail.datesSummary', { start, end });
}
