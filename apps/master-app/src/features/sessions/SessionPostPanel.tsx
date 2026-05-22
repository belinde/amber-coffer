import type { Campaign, Session } from '@amber/shared';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/Button.js';

import { SessionTabletopSection } from './SessionTabletopSection.js';
import { SessionWorkflowPanel } from './SessionWorkflowPanel.js';

type Props = {
  campaignId: Campaign['id'];
  session: Session;
  onSessionUpdated: (session: Session) => void;
  onError: (message: string) => void;
  onConfigureDiscord: () => void;
  onOpenCharacters?: (() => void) | undefined;
};

export function SessionPostPanel({
  campaignId,
  session,
  onSessionUpdated,
  onError,
  onConfigureDiscord,
  onOpenCharacters,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [tabletopOpen, setTabletopOpen] = useState(false);

  return (
    <div className="session-post">
      <SessionWorkflowPanel
        session={session}
        campaignId={campaignId}
        onSessionUpdated={onSessionUpdated}
        onError={onError}
        onConfigureDiscord={onConfigureDiscord}
        onOpenCharacters={onOpenCharacters}
      />

      <div className="session-post__tabletop-toggle">
        <Button type="button" onClick={() => setTabletopOpen((v) => !v)}>
          {tabletopOpen ? t('sessionDetail.postHideTabletop') : t('sessionDetail.postShowTabletop')}
        </Button>
      </div>
      {tabletopOpen ? (
        <SessionTabletopSection
          campaignId={campaignId}
          sessionId={session.id}
          syncEnabled={tabletopOpen}
          onError={onError}
        />
      ) : null}
    </div>
  );
}
