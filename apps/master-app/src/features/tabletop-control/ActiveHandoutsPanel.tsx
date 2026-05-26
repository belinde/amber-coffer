import type { Campaign, Handout, Session } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { hideHandout, listHandouts } from '../../bridge/handouts.js';
import { formatInvokeErrorMessage } from '../../bridge/parse-invoke-error.js';
import { Button } from '../../components/ui/Button.js';
import { fetchMasterSyncCredentials } from '../session-share/fetch-master-sync-credentials.js';

import { buildTabletopSnapshot } from './bridge.js';
import { putSessionSnapshot } from './session-sync-api.js';
import { bumpTabletopSnapshot } from './tabletop-sync-bump.js';

type Props = {
  campaignId: Campaign['id'];
  sessionId: Session['id'];
  activeMapId: string | null;
  onError: (message: string) => void;
};

/**
 * Shows handouts currently visible to players with the ability to hide them.
 */
export function ActiveHandoutsPanel({
  campaignId,
  sessionId,
  activeMapId,
  onError,
}: Props): ReactElement | null {
  const { t } = useTranslation();
  const [handouts, setHandouts] = useState<Handout[]>([]);
  const [hidingId, setHidingId] = useState<string | null>(null);

  const loadHandouts = useCallback(async () => {
    try {
      const all = await listHandouts(sessionId);
      setHandouts(all.filter((h) => h.visibleToPlayers));
    } catch {
      // Silently ignore — panel is informational
    }
  }, [sessionId]);

  useEffect(() => {
    void loadHandouts();
    const interval = setInterval(() => void loadHandouts(), 5000);
    return () => clearInterval(interval);
  }, [loadHandouts]);

  async function handleHide(handoutId: Handout['id']): Promise<void> {
    setHidingId(handoutId);
    try {
      await hideHandout(handoutId);

      const creds = await fetchMasterSyncCredentials({ campaignId, sessionId });
      const snapshot = await buildTabletopSnapshot(sessionId, activeMapId);
      await putSessionSnapshot({
        sessionToken: creds.sessionToken,
        campaignId,
        sessionId,
        snapshot,
      });
      bumpTabletopSnapshot();
      setHandouts((prev) => prev.filter((h) => h.id !== handoutId));
    } catch (err) {
      onError(formatInvokeErrorMessage(err));
    } finally {
      setHidingId(null);
    }
  }

  if (handouts.length === 0) return null;

  return (
    <section className="active-handouts-panel" aria-labelledby="active-handouts-heading">
      <h4 id="active-handouts-heading">{t('tabletop.activeHandoutsTitle')}</h4>
      <ul className="active-handouts-panel__list">
        {handouts.map((h) => (
          <li key={h.id} className="active-handouts-panel__item">
            <span className="active-handouts-panel__label">{h.label}</span>
            <Button
              type="button"
              className="active-handouts-panel__hide-btn"
              disabled={hidingId === h.id}
              onClick={() => void handleHide(h.id)}
            >
              {hidingId === h.id ? t('images.showToPlayersLoading') : t('images.hideFromPlayers')}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
