import type { Campaign, Session } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getSession } from '../../bridge/sessions.js';
import { Button } from '../../components/ui/Button.js';
import { SessionsIcon } from '../../components/ui/icons.js';
import { PanelPageHeader } from '../../components/ui/PanelPageHeader.js';

import { formatSessionLabel } from './session-label.js';
import { SessionMetadataBar } from './SessionMetadataBar.js';
import { SessionTabletopSection } from './SessionTabletopSection.js';
import { SessionWorkflowPanel } from './SessionWorkflowPanel.js';

type Props = {
  campaignId: Campaign['id'];
  sessionId: Session['id'];
  onBack: () => void;
  onError: (message: string) => void;
  onConfigureDiscord: () => void;
};

export function SessionDetailView({
  campaignId,
  sessionId,
  onBack,
  onError,
  onConfigureDiscord,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await getSession(sessionId);
      if (!row) {
        onError(t('sessionDetail.notFound'));
        onBack();
        return;
      }
      setSession(row);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [onBack, onError, sessionId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="session-detail">
        <PanelPageHeader icon={SessionsIcon} title={t('sessionDetail.loadingTitle')} onBack={onBack} />
        <p className="empty-state">{t('common.loading')}</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="session-detail">
        <PanelPageHeader icon={SessionsIcon} title={t('sessionDetail.loadingTitle')} onBack={onBack} />
        <p className="empty-state">{t('sessionDetail.notFound')}</p>
        <Button type="button" onClick={onBack}>
          {t('common.back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="session-detail">
      <PanelPageHeader
        icon={SessionsIcon}
        title={formatSessionLabel(session, t)}
        subtitle={t(`session.statusValues.${session.status}`)}
        onBack={onBack}
      />

      <SessionMetadataBar session={session} onSessionUpdated={setSession} onError={onError} />

      <div className="session-detail__body">
        <SessionWorkflowPanel
          session={session}
          onSessionUpdated={setSession}
          onError={onError}
          onConfigureDiscord={onConfigureDiscord}
        />
        <SessionTabletopSection campaignId={campaignId} onError={onError} />
      </div>
    </div>
  );
}
