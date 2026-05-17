import type { Campaign, EntityRef, EntityRefKind } from '@amber/shared';
import { entityRefKindSchema } from '@amber/shared';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../components/ui/Button.js';
import { ActionIcons } from '../../../components/ui/icons.js';
import { SubjectPicker } from '../../../components/ui/SubjectPicker.js';
import { TabularList } from '../../../components/ui/TabularList.js';
import { useCampaignSubjects } from '../../campaign-subjects/use-campaign-subjects.js';
import { fieldErrorAt } from '../../validation/field-error-helpers.js';

type Props = {
  campaignId: Campaign['id'];
  value: EntityRef[];
  onChange: (value: EntityRef[]) => void;
  fieldErrors?: Readonly<Record<string, string>> | undefined;
};

function refKey(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`;
}

export function EntityRefPicker({ campaignId, value, onChange, fieldErrors }: Props): ReactElement {
  const { t } = useTranslation();
  const { labelFor } = useCampaignSubjects(campaignId);
  const [draftKind, setDraftKind] = useState<EntityRefKind>('character');
  const [draftId, setDraftId] = useState('');

  const entries = useMemo(
    () =>
      value.map((ref) => ({
        id: refKey(ref),
        row: {
          title: labelFor(ref.kind, ref.id) ?? ref.id,
          subtitle: t(`vault.entityKind.${ref.kind}`),
        },
      })),
    [value, labelFor, t],
  );

  function addRef(): void {
    if (!draftKind || !draftId) return;
    if (value.some((r) => r.kind === draftKind && r.id === draftId)) return;
    onChange([...value, { kind: draftKind, id: draftId } as EntityRef]);
    setDraftId('');
  }

  function removeRef(key: string): void {
    onChange(value.filter((r) => refKey(r) !== key));
  }

  const linksError = fieldErrorAt(fieldErrors, 'linkedEntities');

  return (
    <div className={linksError ? 'vault-list-editor field field--invalid' : 'vault-list-editor'}>
      {linksError ? (
        <p className="field-error" role="alert">
          {linksError}
        </p>
      ) : null}
      <SubjectPicker
        campaignId={campaignId}
        allowedKinds={entityRefKindSchema.options}
        kind={draftKind}
        subjectId={draftId}
        onKindChange={(k) => {
          if (k !== '') setDraftKind(k);
        }}
        onSubjectIdChange={setDraftId}
        translateKind={(k) => t(`vault.entityKind.${k}`)}
        kindLabel={t('vault.fields.linkKind')}
        subjectLabel={t('vault.fields.linkSubject')}
        subjectTrailing={
          <Button
            type="button"
            className="subject-picker__add-btn"
            icon={ActionIcons.add}
            disabled={!draftId}
            onClick={addRef}
          >
            {t('vault.fields.addLink')}
          </Button>
        }
      />
      {entries.length > 0 ? (
        <TabularList
          showThumbnails={false}
          entries={entries}
          renderActions={(key) => (
            <Button
              type="button"
              variant="danger"
              icon={ActionIcons.delete}
              onClick={() => removeRef(key)}
            >
              {t('common.delete')}
            </Button>
          )}
        />
      ) : null}
    </div>
  );
}
