import type { Session } from '@amber/shared';
import type { ReactElement, FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { updateSession } from '../../bridge/sessions.js';
import { Button } from '../../components/ui/Button.js';
import { ActionIcons } from '../../components/ui/icons.js';
import { applyValidationFailure } from '../validation/apply-validation-failure.js';
import { fieldErrorAt } from '../validation/field-error-helpers.js';

import { fromDatetimeLocalValue, toDatetimeLocalValue } from './session-datetime.js';

type Props = {
  session: Session;
  onSessionUpdated: (session: Session) => void;
  onError: (message: string) => void;
};

export function SessionMetadataBar({ session, onSessionUpdated, onError }: Props): ReactElement {
  const { t } = useTranslation();
  const [number, setNumber] = useState(String(session.number));
  const [title, setTitle] = useState(session.title ?? '');
  const [startedAt, setStartedAt] = useState(toDatetimeLocalValue(session.startedAt));
  const [endedAt, setEndedAt] = useState(toDatetimeLocalValue(session.endedAt));
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fe = (fieldPath: string) => fieldErrorAt(fieldErrors, fieldPath);

  useEffect(() => {
    setNumber(String(session.number));
    setTitle(session.title ?? '');
    setStartedAt(toDatetimeLocalValue(session.startedAt));
    setEndedAt(toDatetimeLocalValue(session.endedAt));
  }, [session]);

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
          title: title.trim() || null,
          status: session.status,
          startedAt: fromDatetimeLocalValue(startedAt),
          endedAt: fromDatetimeLocalValue(endedAt),
        }),
      );
    } catch (err) {
      if (!applyValidationFailure(err, t, null, setFieldErrors)) {
        onError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="session-metadata-bar" onSubmit={(ev) => void handleSubmit(ev)}>
      <label className="session-metadata-bar__field session-metadata-bar__field--number">
        <span className="session-metadata-bar__label">{t('session.number')}</span>
        <input
          type="number"
          min={1}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          aria-invalid={Boolean(fe('number'))}
          required
        />
        {fe('number') ? <span className="field-error">{fe('number')}</span> : null}
      </label>
      <label className="session-metadata-bar__field session-metadata-bar__field--title">
        <span className="session-metadata-bar__label">{t('session.title')}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="session-metadata-bar__field session-metadata-bar__field--datetime">
        <span className="session-metadata-bar__label">{t('session.startedAt')}</span>
        <input
          type="datetime-local"
          value={startedAt}
          onChange={(e) => setStartedAt(e.target.value)}
        />
      </label>
      <label className="session-metadata-bar__field session-metadata-bar__field--datetime">
        <span className="session-metadata-bar__label">{t('session.endedAt')}</span>
        <input type="datetime-local" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
      </label>
      <Button
        type="submit"
        variant="primary"
        icon={ActionIcons.save}
        disabled={saving}
        className="session-metadata-bar__save"
      >
        {saving ? t('common.saving') : t('sessionDetail.metadataSave')}
      </Button>
    </form>
  );
}
