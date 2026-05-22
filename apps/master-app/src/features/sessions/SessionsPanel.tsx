import type { Campaign, Session } from '@amber/shared';
import type { TFunction } from 'i18next';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createSession, deleteSession, listSessions } from '../../bridge/sessions.js';
import { Button } from '../../components/ui/Button.js';
import { Field } from '../../components/ui/Field.js';
import { ActionIcons } from '../../components/ui/icons.js';
import { buildTabularRow, type TabularListRow } from '../../components/ui/tabular-list.js';
import { FormActionErrorOutlet } from '../../context/AppErrorContext.js';
import { CrudPanel } from '../crud/CrudPanel.js';
import { applyValidationFailure } from '../validation/apply-validation-failure.js';

import { formatSessionLabel } from './session-label.js';
import { isSessionPlayLocked } from './session-phase.js';

type CampaignId = Campaign['id'];

type Props = {
  campaignId: CampaignId;
  onError: (message: string) => void;
  onOpenSession: (sessionId: Session['id']) => void;
};

function sessionListRow(session: Session, t: TFunction): TabularListRow {
  return buildTabularRow({
    title: formatSessionLabel(session, t),
    subtitle: `${t(`session.playState.${session.playState}`)} · ${t(`session.statusValues.${session.status}`)}`,
    details: [
      session.startedAt
        ? t('session.startedAtValue', { value: formatDateTime(session.startedAt) })
        : undefined,
      session.endedAt
        ? t('session.endedAtValue', { value: formatDateTime(session.endedAt) })
        : undefined,
    ].filter((d): d is string => Boolean(d)),
  });
}

export function SessionsPanel({ campaignId, onError, onOpenSession }: Props): ReactElement {
  const { t } = useTranslation();

  return (
    <CrudPanel<Session>
      listTitleKey="session.listTitle"
      createKey="session.create"
      emptyKey="session.empty"
      deleteConfirmKey="session.deleteConfirmFull"
      openItemKey="sessionDetail.openSession"
      listFn={() => listSessions(campaignId)}
      deleteFn={deleteSession}
      canDelete={(s) => !isSessionPlayLocked(s)}
      getLabel={(s) => formatSessionLabel(s, t)}
      getListRow={(s) => sessionListRow(s, t)}
      onOpenItem={(session) => onOpenSession(session.id)}
      onError={onError}
      renderEditor={({ onSaved, onCancel, onError: onEditorError }) => (
        <SessionCreateForm
          campaignId={campaignId}
          onSaved={(created) => {
            onSaved(created);
            onOpenSession(created.id);
          }}
          onCancel={onCancel}
          onError={onEditorError}
        />
      )}
    />
  );
}

function SessionCreateForm({
  campaignId,
  onSaved,
  onCancel,
  onError,
}: {
  campaignId: CampaignId;
  onSaved: (s: Session) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      onSaved(
        await createSession({
          campaignId,
          title: title.trim() || null,
          status: 'planned',
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
    <form onSubmit={(ev) => void handleSubmit(ev)}>
      <h2>{t('session.createTitle')}</h2>
      <p className="vault-section-help">{t('session.numberAuto')}</p>
      <Field label={t('session.title')} htmlFor="sess-create-title">
        <input id="sess-create-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <FormActionErrorOutlet />
      <div className="form-actions">
        <Button type="submit" variant="primary" icon={ActionIcons.save} disabled={saving}>
          {saving ? t('common.saving') : t('sessionDetail.createAndOpen')}
        </Button>
        <Button type="button" icon={ActionIcons.cancel} onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString();
}
