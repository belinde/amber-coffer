import type { Session } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatInvokeErrorMessage } from '../../bridge/parse-invoke-error.js';
import {
  getSessionPipelineState,
  sessionRunTranscription,
  type SessionPipelineState,
} from '../../bridge/session-pipeline.js';
import { getSession } from '../../bridge/sessions.js';
import { Button } from '../../components/ui/Button.js';

import { SessionRecordingControls } from './SessionRecordingControls.js';

type Props = {
  session: Session;
  onSessionUpdated: (session: Session) => void;
  onError: (message: string) => void;
  onConfigureDiscord?: () => void;
  onOpenCharacters?: (() => void) | undefined;
};

type StepState = 'pending' | 'active' | 'done' | 'disabled';

const PIPELINE_POLL_MS = 1500;
const PIPELINE_POLL_FAST_MS = 400;

function stepClass(state: StepState): string {
  return `session-workflow__step session-workflow__step--${state}`;
}

export function SessionWorkflowPanel({
  session,
  onSessionUpdated,
  onError,
  onConfigureDiscord,
  onOpenCharacters,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [pipeline, setPipeline] = useState<SessionPipelineState | null>(null);
  const [busy, setBusy] = useState(false);
  const [transcriptionLaunching, setTranscriptionLaunching] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const state = await getSessionPipelineState(session.id);
      setPipeline(state);
      if (state.status !== session.status) {
        const row = await getSession(session.id);
        if (row) onSessionUpdated(row);
      }
    } catch (err) {
      onError(formatInvokeErrorMessage(err));
    }
  }, [onError, onSessionUpdated, session.id, session.status]);

  useEffect(() => {
    void refresh();
  }, [refresh, session.status]);

  const botReady = pipeline?.hasBotToken === true;
  const transcriptionActive = pipeline?.transcriptionActive === true;
  const isTranscribing = session.status === 'transcribing' || transcriptionActive;

  useEffect(() => {
    if (!isTranscribing && !transcriptionLaunching) return;
    const intervalMs = transcriptionLaunching ? PIPELINE_POLL_FAST_MS : PIPELINE_POLL_MS;
    const timer = window.setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isTranscribing, transcriptionLaunching, refresh]);

  async function runTranscription(): Promise<void> {
    setTranscriptionLaunching(true);
    setBusy(true);
    try {
      const updated = await sessionRunTranscription(session.id);
      onSessionUpdated(updated);
      const state = await getSessionPipelineState(session.id);
      setPipeline(state);
      if (updated.status !== 'transcribing' && !state.transcriptionActive) {
        onError(t('sessionDetail.transcriptionNotStarted'));
      }
    } catch (err) {
      onError(formatInvokeErrorMessage(err));
    } finally {
      setTranscriptionLaunching(false);
      setBusy(false);
    }
  }

  const recordingActive = pipeline?.recordingActive === true;
  const hasAudio = (pipeline?.recordingCount ?? 0) > 0 || pipeline?.hasManifest === true;

  const canTranscribe =
    botReady &&
    pipeline !== null &&
    !recordingActive &&
    !transcriptionActive &&
    hasAudio &&
    ['recorded', 'transcribed'].includes(session.status);

  const transcriptionStalled =
    session.status === 'transcribing' && !transcriptionActive && !pipeline?.hasRawTranscript;

  const canRetryTranscription =
    transcriptionStalled && botReady && pipeline !== null && !recordingActive && hasAudio;

  const showTranscriptionProgress =
    transcriptionLaunching || (isTranscribing && !transcriptionStalled);
  const showTranscriptionAction =
    (canTranscribe || canRetryTranscription) &&
    !transcriptionLaunching &&
    !showTranscriptionProgress;

  const transcriptionProgressPercent = Math.round((pipeline?.transcriptionProgress ?? 0) * 100);

  const recordState: StepState = pipeline?.transcriptionAttempted
    ? 'done'
    : recordingActive
      ? 'active'
      : hasAudio
        ? 'done'
        : 'pending';
  const hasRawTranscript = pipeline?.hasRawTranscript === true;
  const hasRefinedTranscript = pipeline?.hasRefinedTranscript === true;

  const transcribeState: StepState =
    hasRawTranscript ||
    session.status === 'transcribed' ||
    session.status === 'refining' ||
    session.status === 'refined'
      ? 'done'
      : showTranscriptionProgress || transcriptionLaunching
        ? 'active'
        : canTranscribe || canRetryTranscription
          ? 'pending'
          : recordingActive
            ? 'disabled'
            : 'pending';

  const refineReady =
    hasRawTranscript &&
    !transcriptionActive &&
    !transcriptionLaunching &&
    !showTranscriptionProgress;

  const refineState: StepState =
    hasRefinedTranscript ||
    session.status === 'refined' ||
    session.status === 'validating' ||
    session.status === 'published'
      ? 'done'
      : session.status === 'refining'
        ? 'active'
        : refineReady
          ? 'pending'
          : 'disabled';

  return (
    <section className="session-workflow" aria-labelledby="session-workflow-heading">
      <h3 id="session-workflow-heading">{t('sessionDetail.workflowTitle')}</h3>

      {pipeline === null ? (
        <p className="empty-state">{t('common.loading')}</p>
      ) : !botReady ? (
        <div
          className="info-banner info-banner--static session-workflow__bot-alert"
          role="alert"
          aria-labelledby="session-workflow-bot-alert-title"
        >
          <div className="info-banner__body">
            <h4 id="session-workflow-bot-alert-title" className="info-banner__title">
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
      ) : (
        <ol className="session-workflow__steps">
          <li className={stepClass(recordState)}>
            <div className="session-workflow__step-head">
              <span className="session-workflow__step-index">1</span>
              <span className="session-workflow__step-title">{t('sessionDetail.stepRecord')}</span>
            </div>
            <SessionRecordingControls
              session={session}
              onSessionUpdated={(updated) => {
                onSessionUpdated(updated);
                void refresh();
              }}
              onError={onError}
              onConfigureDiscord={onConfigureDiscord}
              onOpenCharacters={onOpenCharacters}
              compact
            />
          </li>

          <li className={stepClass(transcribeState)}>
            <div className="session-workflow__step-head">
              <span className="session-workflow__step-index">2</span>
              <span className="session-workflow__step-title">
                {t('sessionDetail.stepTranscribe')}
              </span>
            </div>
            <p className="session-workflow__step-hint">{t('sessionDetail.stepTranscribeHint')}</p>
            <dl className="session-workflow__meta">
              <div>
                <dt>{t('liveSession.hasRawTranscript')}</dt>
                <dd>
                  {pipeline.hasRawTranscript ? t('liveSession.valueYes') : t('liveSession.valueNo')}
                </dd>
              </div>
            </dl>

            {transcriptionStalled && !transcriptionLaunching ? (
              <p className="session-workflow__warn" role="alert">
                {t('sessionDetail.transcriptionStalled')}
              </p>
            ) : null}

            {showTranscriptionProgress ? (
              <div className="session-workflow__progress" role="status" aria-live="polite">
                <p className="session-workflow__progress-label">
                  {transcriptionLaunching
                    ? t('sessionDetail.transcriptionStarting')
                    : transcriptionActive
                      ? t('sessionDetail.transcriptionRunning', {
                          percent: transcriptionProgressPercent,
                        })
                      : t('sessionDetail.transcriptionFinalizing')}
                </p>
                <progress
                  className="session-workflow__progress-bar"
                  max={100}
                  value={
                    transcriptionLaunching || !transcriptionActive
                      ? undefined
                      : transcriptionProgressPercent
                  }
                />
              </div>
            ) : null}

            {showTranscriptionAction ? (
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() => void runTranscription()}
              >
                {canRetryTranscription
                  ? t('sessionDetail.retryTranscription')
                  : t('liveSession.runTranscription')}
              </Button>
            ) : null}
          </li>

          <li className={stepClass(refineState)}>
            <div className="session-workflow__step-head">
              <span className="session-workflow__step-index">3</span>
              <span className="session-workflow__step-title">{t('sessionDetail.stepRefine')}</span>
            </div>
            <p className="session-workflow__step-hint">
              {refineReady || refineState === 'active' || refineState === 'done'
                ? t('sessionDetail.stepRefineReadyHint')
                : t('sessionDetail.stepRefineHint')}
            </p>
            {refineReady || refineState === 'done' ? (
              <dl className="session-workflow__meta">
                <div>
                  <dt>{t('sessionDetail.hasRefinedTranscript')}</dt>
                  <dd>
                    {hasRefinedTranscript ? t('liveSession.valueYes') : t('liveSession.valueNo')}
                  </dd>
                </div>
              </dl>
            ) : null}
          </li>
        </ol>
      )}
    </section>
  );
}
