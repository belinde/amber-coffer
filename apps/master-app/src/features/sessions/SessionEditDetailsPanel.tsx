import type { Session } from '@amber/shared';
import type { ReactElement, FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getSessionPipelineState } from '../../bridge/session-pipeline.js';
import { deleteSession, updateSession } from '../../bridge/sessions.js';
import { Button } from '../../components/ui/Button.js';
import { ActionIcons } from '../../components/ui/icons.js';
import { applyValidationFailure } from '../validation/apply-validation-failure.js';
import { fieldErrorAt } from '../validation/field-error-helpers.js';

import { fromDatetimeLocalValue, toDatetimeLocalValue } from './session-datetime.js';
import { formatSessionLabel } from './session-label.js';
import { isSessionPlayLocked } from './session-phase.js';

type Props = {
  session: Session;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSessionUpdated: (session: Session) => void;
  onDeleted: () => void;
  onError: (message: string) => void;
};

export function SessionEditDetailsPanel({
  session,
  open,
  onOpenChange,
  onSessionUpdated,
  onDeleted,
  onError,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [number, setNumber] = useState(String(session.number));
  const [startedAt, setStartedAt] = useState(toDatetimeLocalValue(session.startedAt));
  const [endedAt, setEndedAt] = useState(toDatetimeLocalValue(session.endedAt));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fe = (fieldPath: string) => fieldErrorAt(fieldErrors, fieldPath);

  const playLocked = isSessionPlayLocked(session);
  const fieldsDisabled = playLocked || recordingActive;

  useEffect(() => {
    setNumber(String(session.number));
    setStartedAt(toDatetimeLocalValue(session.startedAt));
    setEndedAt(toDatetimeLocalValue(session.endedAt));
  }, [session]);

  useEffect(() => {
    if (!open) return;
    void getSessionPipelineState(session.id)
      .then((state) => setRecordingActive(state.recordingActive))
      .catch(() => setRecordingActive(false));
  }, [open, session.id]);

  async function handleSubmit(ev: FormEvent): Promise<void> {
    ev.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      const parsedNumber = Number.parseInt(number, 10);
      if (Number.isNaN(parsedNumber) || parsedNumber <= 0) {
        setFieldErrors({ number: t('session.numberInvalid') });
        return;
      }
      onSessionUpdated(
        await updateSession({
          id: session.id,
          number: parsedNumber,
          title: session.title,
          status: session.status,
          startedAt: fromDatetimeLocalValue(startedAt),
          endedAt: fromDatetimeLocalValue(endedAt),
        }),
      );
      onOpenChange(false);
    } catch (err) {
      if (!applyValidationFailure(err, t, null, setFieldErrors)) {
        onError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!window.confirm(t('session.deleteConfirm', { name: formatSessionLabel(session, t) }))) {
      return;
    }
    setDeleting(true);
    try {
      await deleteSession(session.id);
      onDeleted();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="session-edit-details">
      <Button
        type="button"
        variant="default"
        className="session-edit-details__toggle"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
      >
        {open ? t('sessionDetail.editDetailsClose') : t('sessionDetail.editDetails')}
      </Button>
      {open ? (
        <form className="session-edit-details__form" onSubmit={(ev) => void handleSubmit(ev)}>
          <p className="vault-section-help">{t('sessionDetail.editDetailsHint')}</p>
          <label className="session-metadata-bar__field">
            <span className="session-metadata-bar__label">{t('session.number')}</span>
            <input
              type="number"
              min={1}
              value={number}
              disabled={fieldsDisabled}
              onChange={(e) => setNumber(e.target.value)}
              aria-invalid={Boolean(fe('number'))}
            />
            <span className="field-hint">{t('sessionDetail.numberRareHint')}</span>
            {fe('number') ? <span className="field-error">{fe('number')}</span> : null}
          </label>
          <label className="session-metadata-bar__field">
            <span className="session-metadata-bar__label">{t('session.startedAt')}</span>
            <input
              type="datetime-local"
              value={startedAt}
              disabled={fieldsDisabled}
              onChange={(e) => setStartedAt(e.target.value)}
            />
            <span className="field-hint">{t('sessionDetail.startedAtRareHint')}</span>
          </label>
          <label className="session-metadata-bar__field">
            <span className="session-metadata-bar__label">{t('session.endedAt')}</span>
            <input
              type="datetime-local"
              value={endedAt}
              disabled={fieldsDisabled}
              onChange={(e) => setEndedAt(e.target.value)}
            />
            <span className="field-hint">{t('sessionDetail.endedAtRareHint')}</span>
          </label>
          {playLocked ? (
            <p className="session-edit-details__warn" role="status">
              {t('sessionDetail.editDetailsLockedLive')}
            </p>
          ) : null}
          <div className="form-actions">
            <Button
              type="submit"
              variant="primary"
              icon={ActionIcons.save}
              disabled={saving || fieldsDisabled}
            >
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
          <div className="form-actions form-actions--destructive">
            <Button
              type="button"
              variant="danger"
              icon={ActionIcons.delete}
              disabled={deleting || playLocked || recordingActive}
              onClick={() => void handleDelete()}
            >
              {deleting ? t('common.delete') : t('sessionDetail.deleteSession')}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
