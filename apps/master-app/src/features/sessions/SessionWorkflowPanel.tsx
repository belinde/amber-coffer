import type { Session } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getSessionPipelineState,
  sessionRunTranscription,
  sessionStartRecording,
  sessionStopRecording,
  type SessionPipelineState,
} from '../../bridge/session-pipeline.js';
import { Button } from '../../components/ui/Button.js';

type Props = {
  session: Session;
  onSessionUpdated: (session: Session) => void;
  onError: (message: string) => void;
  onConfigureDiscord?: () => void;
};

type StepState = 'pending' | 'active' | 'done' | 'disabled';

function stepClass(state: StepState): string {
  return `session-workflow__step session-workflow__step--${state}`;
}

export function SessionWorkflowPanel({
  session,
  onSessionUpdated,
  onError,
  onConfigureDiscord,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [pipeline, setPipeline] = useState<SessionPipelineState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setPipeline(await getSessionPipelineState(session.id));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }, [onError, session.id]);

  useEffect(() => {
    void refresh();
  }, [refresh, session.status]);

  async function runAction(action: () => Promise<Session>): Promise<void> {
    setBusy(true);
    try {
      onSessionUpdated(await action());
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const recordingActive = pipeline?.recordingActive === true;
  const hasAudio = (pipeline?.recordingCount ?? 0) > 0 || pipeline?.hasManifest === true;

  const canStart =
    pipeline !== null &&
    !recordingActive &&
    pipeline.hasBotToken &&
    ['planned', 'recording', 'recorded', 'transcribed'].includes(session.status);

  const canStop = recordingActive;
  const canTranscribe =
    pipeline !== null &&
    !recordingActive &&
    hasAudio &&
    ['recorded', 'transcribing', 'transcribed'].includes(session.status);

  const prepState: StepState = pipeline?.hasBotToken ? 'done' : 'active';
  const recordState: StepState = recordingActive
    ? 'active'
    : hasAudio
      ? 'done'
      : pipeline?.hasBotToken
        ? 'pending'
        : 'disabled';
  const transcribeState: StepState =
    session.status === 'transcribed' || session.status === 'refining'
      ? 'done'
      : canTranscribe
        ? 'pending'
        : recordingActive
          ? 'disabled'
          : 'pending';

  return (
    <section className="session-workflow" aria-labelledby="session-workflow-heading">
      <h3 id="session-workflow-heading">{t('sessionDetail.workflowTitle')}</h3>

      <ol className="session-workflow__steps">
        <li className={stepClass(prepState)}>
          <div className="session-workflow__step-head">
            <span className="session-workflow__step-index">1</span>
            <span className="session-workflow__step-title">{t('sessionDetail.stepPrepare')}</span>
          </div>
          <p className="session-workflow__step-hint">{t('sessionDetail.stepPrepareHint')}</p>
          {!pipeline?.hasBotToken ? (
            <p className="session-workflow__warn" role="status">
              {t('liveSession.missingBotToken')}
            </p>
          ) : null}
          {onConfigureDiscord ? (
            <Button type="button" onClick={onConfigureDiscord}>
              {t('sessionDetail.configureDiscord')}
            </Button>
          ) : null}
        </li>

        <li className={stepClass(recordState)}>
          <div className="session-workflow__step-head">
            <span className="session-workflow__step-index">2</span>
            <span className="session-workflow__step-title">{t('sessionDetail.stepRecord')}</span>
          </div>
          <p className="session-workflow__step-hint">{t('sessionDetail.stepRecordHint')}</p>
          <dl className="session-workflow__meta">
            <div>
              <dt>{t('liveSession.recordingActive')}</dt>
              <dd>{recordingActive ? t('liveSession.valueYes') : t('liveSession.valueNo')}</dd>
            </div>
            <div>
              <dt>{t('liveSession.trackCount')}</dt>
              <dd>{pipeline?.recordingCount ?? 0}</dd>
            </div>
          </dl>
          <div className="session-workflow__actions">
            <Button
              type="button"
              variant="primary"
              disabled={busy || !canStart}
              onClick={() => void runAction(() => sessionStartRecording(session.id))}
            >
              {t('liveSession.startRecording')}
            </Button>
            <Button
              type="button"
              disabled={busy || !canStop}
              onClick={() => void runAction(() => sessionStopRecording(session.id))}
            >
              {t('liveSession.stopRecording')}
            </Button>
          </div>
        </li>

        <li className={stepClass(transcribeState)}>
          <div className="session-workflow__step-head">
            <span className="session-workflow__step-index">3</span>
            <span className="session-workflow__step-title">{t('sessionDetail.stepTranscribe')}</span>
          </div>
          <p className="session-workflow__step-hint">{t('sessionDetail.stepTranscribeHint')}</p>
          <dl className="session-workflow__meta">
            <div>
              <dt>{t('liveSession.hasRawTranscript')}</dt>
              <dd>{pipeline?.hasRawTranscript ? t('liveSession.valueYes') : t('liveSession.valueNo')}</dd>
            </div>
          </dl>
          <Button
            type="button"
            disabled={busy || !canTranscribe}
            onClick={() => void runAction(() => sessionRunTranscription(session.id))}
          >
            {t('liveSession.runTranscription')}
          </Button>
        </li>

        <li className={stepClass('disabled')}>
          <div className="session-workflow__step-head">
            <span className="session-workflow__step-index">4</span>
            <span className="session-workflow__step-title">{t('sessionDetail.stepRefine')}</span>
          </div>
          <p className="session-workflow__step-hint">{t('sessionDetail.stepRefineHint')}</p>
        </li>
      </ol>
    </section>
  );
}
