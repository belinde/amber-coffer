import type { Session } from '@amber/shared';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { beginSessionPlay, endSessionPlay } from '../../bridge/sessions.js';
import { Button } from '../../components/ui/Button.js';
import { useActiveSession } from '../../context/ActiveSessionContext.js';

import { formatSessionDatesSummary } from './format-session-dates.js';
import { formatSessionLabel } from './session-label.js';
import type { SessionUiPhase } from './session-phase.js';
import { SessionDeleteButton } from './SessionDeleteButton.js';
import { SessionEditDetailsPanel } from './SessionEditDetailsPanel.js';

type Props = {
  session: Session;
  phase: SessionUiPhase;
  onSessionUpdated: (session: Session) => void;
  onDeleted: () => void;
  onError: (message: string) => void;
};

export function SessionPhaseHeader({
  session,
  phase,
  onSessionUpdated,
  onDeleted,
  onError,
}: Props): ReactElement {
  const { t, i18n } = useTranslation();
  const { refreshActiveSession, setActiveSessionFromRow } = useActiveSession();
  const [playBusy, setPlayBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const phaseLabelKey =
    phase === 'preparing'
      ? 'sessionDetail.phasePreparing'
      : phase === 'live'
        ? 'sessionDetail.phaseLive'
        : 'sessionDetail.phasePost';

  async function handleBeginPlay(): Promise<void> {
    setPlayBusy(true);
    try {
      const updated = await beginSessionPlay(session.id);
      onSessionUpdated(updated);
      setActiveSessionFromRow(updated);
      await refreshActiveSession();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setPlayBusy(false);
    }
  }

  async function handleEndPlay(): Promise<void> {
    if (!window.confirm(t('sessionDetail.endPlayConfirm'))) {
      return;
    }
    setPlayBusy(true);
    try {
      const updated = await endSessionPlay(session.id);
      onSessionUpdated(updated);
      setActiveSessionFromRow(null);
      await refreshActiveSession();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setPlayBusy(false);
    }
  }

  return (
    <header className="session-phase-header">
      <div className="session-phase-header__main">
        <span className="session-phase-header__badge">{t(phaseLabelKey)}</span>
        <p className="session-phase-header__label">{formatSessionLabel(session, t)}</p>
        <p className="session-phase-header__dates">
          {formatSessionDatesSummary(session, t, i18n.language)}
        </p>
        <p className="session-phase-header__pipeline-status">
          {t(`session.statusValues.${session.status}`)}
        </p>
      </div>
      <div className="session-phase-header__actions">
        {phase === 'preparing' ? (
          <Button
            type="button"
            variant="primary"
            disabled={playBusy}
            onClick={() => void handleBeginPlay()}
          >
            {t('sessionDetail.beginPlay')}
          </Button>
        ) : null}
        {phase === 'live' ? (
          <Button
            type="button"
            variant="danger"
            disabled={playBusy}
            onClick={() => void handleEndPlay()}
          >
            {t('sessionDetail.endPlay')}
          </Button>
        ) : null}
        <SessionEditDetailsPanel
          session={session}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSessionUpdated={onSessionUpdated}
          onError={onError}
        />
        <SessionDeleteButton session={session} onDeleted={onDeleted} onError={onError} />
      </div>
    </header>
  );
}
