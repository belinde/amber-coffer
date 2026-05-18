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
};

export function SessionPostPanel({
  campaignId,
  session,
  onSessionUpdated,
  onError,
  onConfigureDiscord,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [tabletopOpen, setTabletopOpen] = useState(false);

  return (
    <div className="session-post">
      <SessionWorkflowPanel
        session={session}
        onSessionUpdated={onSessionUpdated}
        onError={onError}
        onConfigureDiscord={onConfigureDiscord}
      />

      <div className="session-post__tabletop-toggle">
        <Button type="button" onClick={() => setTabletopOpen((v) => !v)}>
          {tabletopOpen ? t('sessionDetail.postHideTabletop') : t('sessionDetail.postShowTabletop')}
        </Button>
      </div>
      {tabletopOpen ? <SessionTabletopSection campaignId={campaignId} onError={onError} /> : null}
    </div>
  );
}
