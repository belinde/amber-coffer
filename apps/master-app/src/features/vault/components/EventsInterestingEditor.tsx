import type { Campaign, EventReference, Session } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listSessions } from '../../../bridge/sessions.js';
import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { ActionIcons } from '../../../components/ui/icons.js';
import { formatSessionLabel } from '../../sessions/session-label.js';
import { fieldErrorAt } from '../../validation/field-error-helpers.js';

type Props = {
  campaignId: Campaign['id'];
  value: EventReference[];
  onChange: (value: EventReference[]) => void;
  fieldErrors?: Readonly<Record<string, string>> | undefined;
  onOpenSessions?: (() => void) | undefined;
};

export function EventsInterestingEditor({
  campaignId,
  value,
  onChange,
  fieldErrors,
  onOpenSessions,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      setSessions(await listSessions(campaignId));
    } catch {
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const defaultSessionId = sessions[0]?.id;

  function updateAt(index: number, patch: Partial<EventReference>): void {
    const next = value.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange(next);
  }

  function addEvent(): void {
    if (!defaultSessionId) return;
    onChange([
      ...value,
      {
        sessionId: defaultSessionId,
        summary: '',
        occurredAt: Date.now(),
      },
    ]);
  }

  function removeAt(index: number): void {
    onChange(value.filter((_, i) => i !== index));
  }

  const canAdd = Boolean(defaultSessionId) && !loadingSessions;

  return (
    <div className="vault-list-editor">
      <p className="vault-section-help">{t('vault.eventsHint')}</p>
      {!loadingSessions && sessions.length === 0 ? (
        <div className="vault-events-empty">
          <p className="empty-state">{t('vault.eventsNoSessions')}</p>
          {onOpenSessions ? (
            <Button type="button" icon={ActionIcons.open} onClick={onOpenSessions}>
              {t('vault.openSessions')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {value.map((event, index) => (
        <div key={index} className="vault-list-item">
          <Field
            label={t('vault.fields.eventSession')}
            error={fieldErrorAt(fieldErrors, `eventsInteresting.${index}.sessionId`)}
          >
            <select
              value={event.sessionId}
              disabled={loadingSessions || sessions.length === 0}
              onChange={(ev) =>
                updateAt(index, { sessionId: ev.target.value as EventReference['sessionId'] })
              }
            >
              {sessions.length === 0 ? (
                <option value="">{t('vault.eventsNoSessionsShort')}</option>
              ) : (
                <>
                  {!sessions.some((s) => s.id === event.sessionId) ? (
                    <option value={event.sessionId}>{t('vault.unknownSession')}</option>
                  ) : null}
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {formatSessionLabel(session, t)}
                    </option>
                  ))}
                </>
              )}
            </select>
          </Field>
          <Field
            label={t('vault.fields.eventSummary')}
            error={fieldErrorAt(fieldErrors, `eventsInteresting.${index}.summary`)}
          >
            <textarea
              value={event.summary}
              rows={2}
              onChange={(ev) => updateAt(index, { summary: ev.target.value })}
            />
          </Field>
          <Button type="button" variant="danger" icon={ActionIcons.delete} onClick={() => removeAt(index)}>
            {t('common.delete')}
          </Button>
        </div>
      ))}
      <Button type="button" icon={ActionIcons.add} onClick={addEvent} disabled={!canAdd}>
        {t('vault.addEvent')}
      </Button>
    </div>
  );
}
