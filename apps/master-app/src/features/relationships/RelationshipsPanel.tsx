import type { Campaign, Relationship } from '@amber/shared';
import type { TFunction } from 'i18next';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  createRelationship,
  deleteRelationship,
  entityKindSchema,
  listRelationships,
  relationTypeSchema,
  updateRelationship,
} from '../../bridge/relationships.js';
import { Button } from '../../components/ui/Button.js';
import { Field } from '../../components/ui/Field.js';
import { ActionIcons } from '../../components/ui/icons.js';
import { SubjectPicker } from '../../components/ui/SubjectPicker.js';
import { buildTabularRow, type TabularListRow } from '../../components/ui/tabular-list.js';
import { useCampaignSubjects } from '../campaign-subjects/use-campaign-subjects.js';
import { CrudPanel } from '../crud/CrudPanel.js';
import { compactJoin, truncatePreview } from '../list-display/format.js';
import { applyValidationFailure } from '../validation/apply-validation-failure.js';
import { fieldErrorAt } from '../validation/field-error-helpers.js';

type CampaignId = Campaign['id'];

type Props = { campaignId: CampaignId; onError: (message: string) => void };

function relationshipListRow(
  relationship: Relationship,
  t: TFunction,
  labelFor: (kind: string, id: string) => string | undefined,
): TabularListRow {
  const from =
    labelFor(relationship.fromKind, relationship.fromId) ?? relationship.fromId;
  const to = labelFor(relationship.toKind, relationship.toId) ?? relationship.toId;

  return buildTabularRow({
    title: `${from} → ${to}`,
    subtitle: compactJoin([
      t(`relationship.typeValues.${relationship.relationType}`),
      t('relationship.strengthValue', { value: relationship.strength }),
    ]),
    details: [
      relationship.bidirectional ? t('relationship.bidirectional') : undefined,
      truncatePreview(relationship.description),
    ].filter((d): d is string => Boolean(d)),
  });
}

export function RelationshipsPanel({ campaignId, onError }: Props): ReactElement {
  const { t } = useTranslation();
  const { labelFor } = useCampaignSubjects(campaignId);

  return (
    <CrudPanel<Relationship>
      listTitleKey="relationship.listTitle"
      createKey="relationship.create"
      emptyKey="relationship.empty"
      deleteConfirmKey="relationship.deleteConfirm"
      listFn={() => listRelationships(campaignId)}
      deleteFn={deleteRelationship}
      getLabel={(r) =>
        `${labelFor(r.fromKind, r.fromId) ?? r.fromId} → ${labelFor(r.toKind, r.toId) ?? r.toId}`
      }
      getListRow={(r) => relationshipListRow(r, t, labelFor)}
      onError={onError}
      renderEditor={({ item, onSaved, onCancel, onError: onEditorError }) => (
        <RelationshipEditor
          campaignId={campaignId}
          relationship={item}
          onSaved={onSaved}
          onCancel={onCancel}
          onError={onEditorError}
        />
      )}
    />
  );
}

function RelationshipEditor({
  campaignId,
  relationship,
  onSaved,
  onCancel,
  onError,
}: {
  campaignId: CampaignId;
  relationship: Relationship | null;
  onSaved: (r: Relationship) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const isEdit = relationship !== null;
  const [fromKind, setFromKind] = useState(relationship?.fromKind ?? 'character');
  const [fromId, setFromId] = useState(relationship?.fromId ?? '');
  const [toKind, setToKind] = useState(relationship?.toKind ?? 'npc');
  const [toId, setToId] = useState(relationship?.toId ?? '');
  const [relationType, setRelationType] = useState(relationship?.relationType ?? 'knows');
  const [strength, setStrength] = useState(String(relationship?.strength ?? 0));
  const [bidirectional, setBidirectional] = useState(relationship?.bidirectional ?? false);
  const [description, setDescription] = useState(relationship?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fe = (fieldPath: string) => fieldErrorAt(fieldErrors, fieldPath);

  async function handleSubmit(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    const strengthNum = Number.parseInt(strength, 10);
    if (Number.isNaN(strengthNum)) {
      setFieldErrors({ strength: t('relationship.strengthInvalid') });
      return;
    }

    setSaving(true);
    setFieldErrors({});
    try {
      const payload = {
        fromKind,
        fromId: fromId.trim(),
        toKind,
        toId: toId.trim(),
        relationType,
        strength: strengthNum,
        bidirectional,
        description: description.trim() || null,
      };
      if (isEdit && relationship) {
        onSaved(await updateRelationship({ id: relationship.id, ...payload }));
      } else {
        onSaved(await createRelationship({ campaignId, ...payload }));
      }
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
      <h2>{isEdit ? t('relationship.editTitle') : t('relationship.createTitle')}</h2>
      <SubjectPicker
        campaignId={campaignId}
        allowedKinds={entityKindSchema.options}
        kind={fromKind}
        subjectId={fromId}
        onKindChange={(k) => {
          if (k !== '') setFromKind(k);
        }}
        onSubjectIdChange={setFromId}
        translateKind={(k) => t(`relationship.entityKindValues.${k}`)}
        kindLabel={t('relationship.fromKind')}
        subjectLabel={t('relationship.fromSubject')}
        kindError={fe('fromKind')}
        subjectIdError={fe('fromId')}
        required
      />
      <SubjectPicker
        campaignId={campaignId}
        allowedKinds={entityKindSchema.options}
        kind={toKind}
        subjectId={toId}
        onKindChange={(k) => {
          if (k !== '') setToKind(k);
        }}
        onSubjectIdChange={setToId}
        translateKind={(k) => t(`relationship.entityKindValues.${k}`)}
        kindLabel={t('relationship.toKind')}
        subjectLabel={t('relationship.toSubject')}
        kindError={fe('toKind')}
        subjectIdError={fe('toId')}
        required
      />
      <Field label={t('relationship.type')} htmlFor="rel-type" error={fe('relationType')}>
        <select
          id="rel-type"
          value={relationType}
          onChange={(e) => setRelationType(e.target.value as typeof relationType)}
        >
          {relationTypeSchema.options.map((opt) => (
            <option key={opt} value={opt}>
              {t(`relationship.typeValues.${opt}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('relationship.strength')} htmlFor="rel-strength" error={fe('strength')}>
        <input
          id="rel-strength"
          type="number"
          min={-100}
          max={100}
          value={strength}
          onChange={(e) => setStrength(e.target.value)}
        />
      </Field>
      <Field label={t('relationship.bidirectional')} htmlFor="rel-bidir" error={fe('bidirectional')}>
        <input
          id="rel-bidir"
          type="checkbox"
          checked={bidirectional}
          onChange={(e) => setBidirectional(e.target.checked)}
        />
      </Field>
      <Field label={t('relationship.description')} htmlFor="rel-desc" error={fe('description')}>
        <textarea id="rel-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="form-actions">
        <Button type="submit" variant="primary" icon={ActionIcons.save} disabled={saving}>
          {saving ? t('common.saving') : t('common.save')}
        </Button>
        <Button type="button" icon={ActionIcons.cancel} onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
