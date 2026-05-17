import type { Session } from '@amber/shared';
import type { TFunction } from 'i18next';

/** Display label for a session (cosmetic numbering for UI). */
export function formatSessionLabel(session: Session, t: TFunction): string {
  const numbered = t('session.numbered', { number: session.number });
  const title = session.title?.trim();
  return title ? `${numbered} — ${title}` : numbered;
}
