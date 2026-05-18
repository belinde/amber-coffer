import type { Campaign, Session } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getSession } from '../../bridge/sessions.js';
import { Button } from '../../components/ui/Button.js';
import { SessionsIcon } from '../../components/ui/icons.js';
import { PanelPageHeader } from '../../components/ui/PanelPageHeader.js';
import { useActiveSession } from '../../context/ActiveSessionContext.js';
import { ErrorOutlet } from '../../context/AppErrorContext.js';
import { useVaultNavigationContext } from '../vault/VaultNavigationContext.js';

import { formatSessionLabel } from './session-label.js';
import { resolveSessionUiPhase } from './session-phase.js';
import { SessionLivePanel } from './SessionLivePanel.js';
import { SessionPhaseHeader } from './SessionPhaseHeader.js';
import { SessionPostPanel } from './SessionPostPanel.js';
import { SessionPrepPanel } from './SessionPrepPanel.js';

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
  const { pushView } = useVaultNavigationContext();
  const { refreshActiveSession, setActiveSessionFromRow } = useActiveSession();
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
      if (row.playState === 'live') {
        setActiveSessionFromRow(row);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [onBack, onError, sessionId, setActiveSessionFromRow, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSessionUpdated = useCallback(
    (updated: Session) => {
      setSession(updated);
      if (updated.playState === 'live') {
        setActiveSessionFromRow(updated);
      } else {
        void refreshActiveSession();
      }
    },
    [refreshActiveSession, setActiveSessionFromRow],
  );

  if (loading) {
    return (
      <div className="session-detail">
        <PanelPageHeader
          icon={SessionsIcon}
          title={t('sessionDetail.loadingTitle')}
          onBack={onBack}
        />
        <ErrorOutlet region="main" />
        <p className="empty-state">{t('common.loading')}</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="session-detail">
        <PanelPageHeader
          icon={SessionsIcon}
          title={t('sessionDetail.loadingTitle')}
          onBack={onBack}
        />
        <ErrorOutlet region="main" />
        <p className="empty-state">{t('sessionDetail.notFound')}</p>
        <Button type="button" onClick={onBack}>
          {t('common.back')}
        </Button>
      </div>
    );
  }

  const phase = resolveSessionUiPhase(session);
  const phaseClass =
    phase === 'preparing'
      ? 'session-detail--preparing'
      : phase === 'live'
        ? 'session-detail--live'
        : 'session-detail--post';

  return (
    <div className={`session-detail ${phaseClass}`}>
      <PanelPageHeader icon={SessionsIcon} title={formatSessionLabel(session, t)} onBack={onBack} />
      <ErrorOutlet region="main" />

      <SessionPhaseHeader
        session={session}
        phase={phase}
        onSessionUpdated={handleSessionUpdated}
        onDeleted={onBack}
        onError={onError}
      />

      <div className="session-detail__body">
        {phase === 'preparing' ? (
          <SessionPrepPanel
            campaignId={campaignId}
            session={session}
            onSessionUpdated={handleSessionUpdated}
            onError={onError}
            onOpenImages={() => pushView({ kind: 'images' })}
          />
        ) : null}
        {phase === 'live' ? (
          <SessionLivePanel
            campaignId={campaignId}
            session={session}
            onSessionUpdated={handleSessionUpdated}
            onError={onError}
            onConfigureDiscord={onConfigureDiscord}
          />
        ) : null}
        {phase === 'post' ? (
          <SessionPostPanel
            campaignId={campaignId}
            session={session}
            onSessionUpdated={handleSessionUpdated}
            onError={onError}
            onConfigureDiscord={onConfigureDiscord}
          />
        ) : null}
      </div>
    </div>
  );
}
