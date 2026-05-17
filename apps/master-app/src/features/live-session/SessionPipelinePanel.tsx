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
};

export function SessionPipelinePanel({
  session,
  onSessionUpdated,
  onError,
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

  const canStart =
    pipeline !== null &&
    !pipeline.recordingActive &&
    pipeline.hasBotToken &&
    (session.status === 'planned' || session.status === 'recording');
  const canStop = pipeline?.recordingActive === true;
  const canTranscribe =
    pipeline !== null &&
    !pipeline.recordingActive &&
    (session.status === 'recorded' ||
      session.status === 'transcribing' ||
      (pipeline.hasManifest && pipeline.recordingCount > 0));

  return (
    <section className="session-pipeline" aria-labelledby="session-pipeline-heading">
      <h3 id="session-pipeline-heading">{t('liveSession.pipelineTitle')}</h3>
      <p className="vault-section-help">{t('liveSession.pipelineHint')}</p>

      {!pipeline?.hasBotToken ? (
        <p className="session-pipeline__warn" role="status">
          {t('liveSession.missingBotToken')}
        </p>
      ) : null}

      <dl className="session-pipeline__meta">
        <div>
          <dt>{t('liveSession.recordingActive')}</dt>
          <dd>{pipeline?.recordingActive ? t('liveSession.valueYes') : t('liveSession.valueNo')}</dd>
        </div>
        <div>
          <dt>{t('liveSession.trackCount')}</dt>
          <dd>{pipeline?.recordingCount ?? 0}</dd>
        </div>
        <div>
          <dt>{t('liveSession.hasRawTranscript')}</dt>
          <dd>{pipeline?.hasRawTranscript ? t('liveSession.valueYes') : t('liveSession.valueNo')}</dd>
        </div>
      </dl>

      <div className="form-actions">
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
        <Button
          type="button"
          disabled={busy || !canTranscribe}
          onClick={() => void runAction(() => sessionRunTranscription(session.id))}
        >
          {t('liveSession.runTranscription')}
        </Button>
      </div>
    </section>
  );
}
