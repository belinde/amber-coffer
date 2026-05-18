import type { Campaign, Item } from '@amber/shared';
import type { TFunction } from 'i18next';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  createItem,
  deleteItem,
  entityOwnerKindSchema,
  itemKindSchema,
  itemRaritySchema,
  listItems,
  updateItem,
} from '../../bridge/items.js';
import { Button } from '../../components/ui/Button.js';
import { Field } from '../../components/ui/Field.js';
import { ActionIcons } from '../../components/ui/icons.js';
import { SubjectPicker } from '../../components/ui/SubjectPicker.js';
import { buildTabularRow, type TabularListRow } from '../../components/ui/tabular-list.js';
import { FormActionErrorOutlet } from '../../context/AppErrorContext.js';
import { useCampaignSubjects } from '../campaign-subjects/use-campaign-subjects.js';
import { CrudPanel } from '../crud/CrudPanel.js';
import { compactJoin, truncatePreview } from '../list-display/format.js';
import { applyValidationFailure } from '../validation/apply-validation-failure.js';
import { fieldErrorAt } from '../validation/field-error-helpers.js';

type CampaignId = Campaign['id'];

type Props = { campaignId: CampaignId; onError: (message: string) => void };

function itemListRow(
  item: Item,
  t: TFunction,
  labelFor: (kind: string, id: string) => string | undefined,
): TabularListRow {
  const ownerLabel =
    item.ownerKind && item.ownerId
      ? `${t(`item.ownerKindValues.${item.ownerKind}`)}: ${labelFor(item.ownerKind, item.ownerId) ?? item.ownerId}`
      : undefined;

  return buildTabularRow({
    title: item.name,
    subtitle: compactJoin([
      item.kind ? t(`item.kindValues.${item.kind}`) : null,
      item.rarity ? t(`item.rarityValues.${item.rarity}`) : null,
    ]),
    details: [ownerLabel, truncatePreview(item.description)].filter((d): d is string => Boolean(d)),
  });
}

export function ItemsPanel({ campaignId, onError }: Props): ReactElement {
  const { t } = useTranslation();
  const { labelFor } = useCampaignSubjects(campaignId);

  return (
    <CrudPanel<Item>
      listTitleKey="item.listTitle"
      createKey="item.create"
      emptyKey="item.empty"
      deleteConfirmKey="item.deleteConfirm"
      listFn={() => listItems(campaignId)}
      deleteFn={deleteItem}
      getLabel={(i) => i.name}
      getListRow={(i) => itemListRow(i, t, labelFor)}
      onError={onError}
      renderEditor={({ item, onSaved, onCancel, onError: onEditorError }) => (
        <ItemEditor
          campaignId={campaignId}
          item={item}
          onSaved={onSaved}
          onCancel={onCancel}
          onError={onEditorError}
        />
      )}
    />
  );
}

function ItemEditor({
  campaignId,
  item,
  onSaved,
  onCancel,
  onError,
}: {
  campaignId: CampaignId;
  item: Item | null;
  onSaved: (i: Item) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const isEdit = item !== null;
  const [name, setName] = useState(item?.name ?? '');
  const [kind, setKind] = useState(item?.kind ?? '');
  const [rarity, setRarity] = useState(item?.rarity ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [ownerKind, setOwnerKind] = useState(item?.ownerKind ?? '');
  const [ownerId, setOwnerId] = useState(item?.ownerId ?? '');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fe = (fieldPath: string) => fieldErrorAt(fieldErrors, fieldPath);

  async function handleSubmit(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      const payload = {
        name: name.trim(),
        kind: (kind || null) as Item['kind'],
        rarity: (rarity || null) as Item['rarity'],
        description: description.trim() || null,
        ownerKind: (ownerKind || null) as Item['ownerKind'],
        ownerId: ownerId.trim() || null,
      };
      if (isEdit && item) {
        onSaved(await updateItem({ id: item.id, ...payload }));
      } else {
        onSaved(await createItem({ campaignId, ...payload }));
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
      <h2>{isEdit ? t('item.editTitle') : t('item.createTitle')}</h2>
      <Field label={t('item.name')} htmlFor="it-name" error={fe('name')}>
        <input id="it-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label={t('item.kind')} htmlFor="it-kind" error={fe('kind')}>
        <select id="it-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">{t('common.none')}</option>
          {itemKindSchema.options.map((k) => (
            <option key={k} value={k}>
              {t(`item.kindValues.${k}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('item.rarity')} htmlFor="it-rarity" error={fe('rarity')}>
        <select id="it-rarity" value={rarity} onChange={(e) => setRarity(e.target.value)}>
          <option value="">{t('common.none')}</option>
          {itemRaritySchema.options.map((r) => (
            <option key={r} value={r}>
              {t(`item.rarityValues.${r}`)}
            </option>
          ))}
        </select>
      </Field>
      <SubjectPicker
        campaignId={campaignId}
        allowedKinds={entityOwnerKindSchema.options}
        kind={ownerKind}
        subjectId={ownerId}
        onKindChange={setOwnerKind}
        onSubjectIdChange={setOwnerId}
        translateKind={(k) => t(`item.ownerKindValues.${k}`)}
        kindLabel={t('item.ownerKind')}
        subjectLabel={t('item.ownerSubject')}
        kindError={fe('ownerKind')}
        subjectIdError={fe('ownerId')}
        allowEmptyKind
      />
      <Field label={t('item.description')} htmlFor="it-desc" error={fe('description')}>
        <textarea
          id="it-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <FormActionErrorOutlet />
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
