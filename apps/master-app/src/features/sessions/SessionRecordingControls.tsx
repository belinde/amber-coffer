import type { Campaign, Session } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatInvokeErrorMessage } from '../../bridge/parse-invoke-error.js';
import {
  getSessionPipelineState,
  sessionStartRecording,
  sessionStopRecording,
  type SessionPipelineState,
} from '../../bridge/session-pipeline.js';
import { Button } from '../../components/ui/Button.js';
import { ActionIcons } from '../../components/ui/icons.js';

import { SessionDiscordParticipantsPanel } from './SessionDiscordParticipantsPanel.js';

type Props = {
  session: Session;
  campaignId: Campaign['id'];
  onSessionUpdated: (session: Session) => void;
  onError: (message: string) => void;
  onConfigureDiscord?: (() => void) | undefined;
  onOpenCharacters?: (() => void) | undefined;
  compact?: boolean;
};

export function SessionRecordingControls({
  session,
  campaignId,
  onSessionUpdated,
  onError,
  onConfigureDiscord,
  onOpenCharacters,
  compact = false,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [pipeline, setPipeline] = useState<SessionPipelineState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const pipe = await getSessionPipelineState(session.id);
      setPipeline(pipe);
    } catch (err) {
      onError(formatInvokeErrorMessage(err));
    }
  }, [onError, session.id]);

  useEffect(() => {
    void refresh();
  }, [refresh, session.status]);

  useEffect(() => {
    if (!pipeline?.recordingActive) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [pipeline?.recordingActive, refresh]);

  async function runAction(action: () => Promise<Session>): Promise<void> {
    setBusy(true);
    try {
      onSessionUpdated(await action());
      await refresh();
    } catch (err) {
      onError(formatInvokeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const botReady = pipeline?.hasBotToken === true;
  const recordingActive = pipeline?.recordingActive === true;
  const showRecordingActions = pipeline !== null && !pipeline.transcriptionAttempted;
  const canStart =
    showRecordingActions &&
    botReady &&
    !recordingActive &&
    ['planned', 'recording', 'recorded'].includes(session.status);
  const canStop = recordingActive;

  if (pipeline === null) {
    return <p className="empty-state">{t('common.loading')}</p>;
  }

  if (!botReady) {
    return (
      <div className="session-recording-controls">
        <div className="info-banner info-banner--static session-workflow__bot-alert" role="alert">
          <div className="info-banner__body">
            <h4 className="info-banner__title">
              {t('sessionDetail.workflowDiscordRequiredTitle')}
            </h4>
            <p className="info-banner__text">{t('sessionDetail.workflowDiscordRequiredHint')}</p>
            {onConfigureDiscord ? (
              <Button type="button" onClick={onConfigureDiscord}>
                {t('sessionDetail.configureDiscord')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const className = compact
    ? 'session-recording-controls session-recording-controls--compact'
    : 'session-recording-controls';

  return (
    <div className={className}>
      {!compact ? (
        <h4 className="session-recording-controls__title">{t('sessionDetail.stepRecord')}</h4>
      ) : null}
      <p className="session-workflow__step-hint">{t('sessionDetail.stepRecordHint')}</p>
      <dl className="session-workflow__meta">
        <div>
          <dt>{t('liveSession.recordingActive')}</dt>
          <dd>{recordingActive ? t('liveSession.valueYes') : t('liveSession.valueNo')}</dd>
        </div>
        <div>
          <dt>{t('sessionDetail.participantCount')}</dt>
          <dd>{pipeline.participantCount}</dd>
        </div>
        <div>
          <dt>{t('sessionDetail.playerCountLabel')}</dt>
          <dd>{pipeline.playerParticipantCount}</dd>
        </div>
      </dl>
      {pipeline.participantCount > 0 ? (
        <SessionDiscordParticipantsPanel
          session={session}
          campaignId={campaignId}
          onError={onError}
          onOpenCharacters={onOpenCharacters}
        />
      ) : null}
      {showRecordingActions ? (
        <div className="session-workflow__actions">
          {recordingActive ? (
            <Button
              type="button"
              variant="danger"
              icon={ActionIcons.stop}
              disabled={busy || !canStop}
              onClick={() => void runAction(() => sessionStopRecording(session.id))}
            >
              {t('liveSession.stopRecording')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="success"
              icon={ActionIcons.record}
              disabled={busy || !canStart}
              onClick={() => void runAction(() => sessionStartRecording(session.id))}
            >
              {t('liveSession.startRecording')}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
