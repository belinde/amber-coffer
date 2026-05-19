import type { Session } from '@amber/shared';
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
import {
  listSessionRecordings,
  type SessionRecordingView,
} from '../../bridge/session-recordings.js';
import { Button } from '../../components/ui/Button.js';
import { ActionIcons } from '../../components/ui/icons.js';

type Props = {
  session: Session;
  onSessionUpdated: (session: Session) => void;
  onError: (message: string) => void;
  onConfigureDiscord?: (() => void) | undefined;
  onOpenCharacters?: (() => void) | undefined;
  compact?: boolean;
};

export function SessionRecordingControls({
  session,
  onSessionUpdated,
  onError,
  onConfigureDiscord,
  onOpenCharacters,
  compact = false,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [pipeline, setPipeline] = useState<SessionPipelineState | null>(null);
  const [recordings, setRecordings] = useState<SessionRecordingView[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [pipe, tracks] = await Promise.all([
        getSessionPipelineState(session.id),
        listSessionRecordings(session.id),
      ]);
      setPipeline(pipe);
      setRecordings(tracks);
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
          <dt>{t('liveSession.trackCount')}</dt>
          <dd>{pipeline.recordingCount}</dd>
        </div>
      </dl>
      {recordings.length > 0 ? (
        <section
          className="session-recording-tracks"
          aria-labelledby="session-recording-tracks-heading"
        >
          <h5 id="session-recording-tracks-heading">{t('sessionDetail.recordingTracksTitle')}</h5>
          <ul className="session-recording-tracks__list">
            {recordings.map((track) => (
              <li key={track.id} className="session-recording-tracks__item">
                <span className="session-recording-tracks__speaker">
                  {t('sessionDetail.recordingTrackDiscord', { id: track.userDiscordId })}
                </span>
                {track.characterName ? (
                  <span className="session-recording-tracks__character">{track.characterName}</span>
                ) : (
                  <span className="session-recording-tracks__unassigned">
                    {t('sessionDetail.recordingTrackUnassigned')}
                    {onOpenCharacters ? (
                      <>
                        {' '}
                        <Button type="button" variant="default" onClick={onOpenCharacters}>
                          {t('sessionDetail.recordingTrackAssign')}
                        </Button>
                      </>
                    ) : null}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
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
