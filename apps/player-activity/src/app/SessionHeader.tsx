import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { SessionStatus } from './session-types.js';

/** Maximum characters before truncation with ellipsis. */
const CAMPAIGN_NAME_MAX_LENGTH = 40;

export type SessionHeaderProps = {
  readonly status: SessionStatus;
  readonly campaignName: string | null;
};

/**
 * Truncates a campaign name to the maximum display length.
 * If the name exceeds 40 characters, it is cut and an ellipsis is appended.
 */
export function truncateCampaignName(name: string): string {
  if (name.length <= CAMPAIGN_NAME_MAX_LENGTH) {
    return name;
  }
  return name.slice(0, CAMPAIGN_NAME_MAX_LENGTH) + '\u2026';
}

/**
 * Renders the app header.
 * - Connected state: compact header with icon + campaign name (max 48px height).
 * - Non-connected states: full header with title and subtitle.
 */
export function SessionHeader({ status, campaignName }: SessionHeaderProps): ReactElement {
  const { t } = useTranslation();

  if (status === 'connected') {
    const displayName = campaignName
      ? truncateCampaignName(campaignName)
      : t('app.campaignNameFallback');

    return (
      <header className="player-activity-layout__header--compact">
        <img
          src="/amber-icon.svg"
          alt=""
          width={24}
          height={24}
          className="player-activity-layout__icon"
        />
        <h2 className="player-activity-layout__campaign-name">{displayName}</h2>
      </header>
    );
  }

  return (
    <header className="player-activity-layout__header">
      <h1>{t('app.title')}</h1>
      <p>{t('app.subtitle')}</p>
    </header>
  );
}
