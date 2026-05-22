import type { Campaign, Session } from '@amber/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/Button.js';
import { useVaultNavigationContext } from '../vault/VaultNavigationContext.js';

import { SessionRecordingControls } from './SessionRecordingControls.js';
import { SessionTabletopSection } from './SessionTabletopSection.js';

type Props = {
  campaignId: Campaign['id'];
  session: Session;
  onSessionUpdated: (session: Session) => void;
  onError: (message: string) => void;
  onConfigureDiscord: () => void;
  onOpenCharacters?: (() => void) | undefined;
};

export function SessionLivePanel({
  campaignId,
  session,
  onSessionUpdated,
  onError,
  onConfigureDiscord,
  onOpenCharacters,
}: Props): ReactElement {
  const { t } = useTranslation();
  const { pushView } = useVaultNavigationContext();

  const pinnedNpcCount = session.npcsEncountered.length;
  const pinnedLocationCount = session.locationsVisited.length;

  return (
    <div className="session-live">
      <section className="session-live__recording" aria-labelledby="session-live-rec-heading">
        <h3 id="session-live-rec-heading">{t('sessionDetail.liveRecordingTitle')}</h3>
        <SessionRecordingControls
          session={session}
          campaignId={campaignId}
          onSessionUpdated={onSessionUpdated}
          onError={onError}
          onConfigureDiscord={onConfigureDiscord}
          onOpenCharacters={onOpenCharacters}
          compact
        />
      </section>

      <SessionTabletopSection
        campaignId={campaignId}
        sessionId={session.id}
        syncEnabled
        onError={onError}
      />

      <section className="session-live__materials" aria-labelledby="session-live-materials-heading">
        <h3 id="session-live-materials-heading">{t('sessionDetail.liveMaterials')}</h3>
        <p className="vault-section-help">
          {t('sessionDetail.liveMaterialsHint', {
            npcCount: pinnedNpcCount,
            locationCount: pinnedLocationCount,
          })}
        </p>
        <div className="session-prep__links">
          <Button type="button" onClick={() => pushView({ kind: 'category', category: 'npcs' })}>
            {t('sessionDetail.prepOpenVaultNpcs')}
          </Button>
          <Button
            type="button"
            onClick={() => pushView({ kind: 'category', category: 'locations' })}
          >
            {t('sessionDetail.prepOpenVaultLocations')}
          </Button>
          <Button type="button" onClick={() => pushView({ kind: 'images' })}>
            {t('sessionDetail.prepOpenImages')}
          </Button>
          <Button type="button" onClick={() => pushView({ kind: 'home' })}>
            {t('sessionDetail.openCampaignCatalog')}
          </Button>
        </div>
      </section>

      <section className="session-live__ingame" aria-labelledby="session-live-ingame-heading">
        <h3 id="session-live-ingame-heading">{t('sessionDetail.liveInGameTitle')}</h3>
        <p className="vault-section-help">{t('sessionDetail.liveInGamePlaceholder')}</p>
      </section>
    </div>
  );
}
