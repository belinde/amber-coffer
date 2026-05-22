import type { Session } from '@amber/shared';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getSessionPipelineState } from '../../bridge/session-pipeline.js';
import { deleteSession } from '../../bridge/sessions.js';
import { Button } from '../../components/ui/Button.js';
import { ActionIcons } from '../../components/ui/icons.js';

import { formatSessionLabel } from './session-label.js';
import { isSessionPlayLocked } from './session-phase.js';

type Props = {
  session: Session;
  onDeleted: () => void;
  onError: (message: string) => void;
};

export function SessionDeleteButton({ session, onDeleted, onError }: Props): ReactNode {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [transcriptionActive, setTranscriptionActive] = useState(false);
  const playLocked = isSessionPlayLocked(session);

  useEffect(() => {
    if (playLocked) return;
    let cancelled = false;
    void getSessionPipelineState(session.id)
      .then((pipeline) => {
        if (cancelled) return;
        setRecordingActive(pipeline.recordingActive);
        setTranscriptionActive(pipeline.transcriptionActive);
      })
      .catch(() => {
        if (cancelled) return;
        setRecordingActive(false);
        setTranscriptionActive(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session.id, playLocked]);

  if (playLocked) {
    return null;
  }

  const blocked = recordingActive || transcriptionActive;
  const disabled = busy || blocked;

  const blockReason = recordingActive
    ? t('sessionDetail.deleteBlockedRecording')
    : transcriptionActive
      ? t('sessionDetail.deleteBlockedTranscription')
      : undefined;

  async function handleDelete(): Promise<void> {
    if (!window.confirm(t('session.deleteConfirmFull', { name: formatSessionLabel(session, t) }))) {
      return;
    }
    setBusy(true);
    try {
      await deleteSession(session.id);
      onDeleted();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="danger"
      icon={ActionIcons.delete}
      className="session-delete-button"
      disabled={disabled}
      title={blockReason}
      onClick={() => void handleDelete()}
    >
      {busy ? t('common.delete') : t('sessionDetail.deleteSession')}
    </Button>
  );
}
