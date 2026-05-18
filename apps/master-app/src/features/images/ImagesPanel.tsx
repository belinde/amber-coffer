import type { Campaign, CampaignImage } from '@amber/shared';
import { visibilitySchema } from '@amber/shared';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  attachCampaignImageFile,
  createCampaignImage,
  deleteCampaignImage,
  listCampaignImages,
  updateCampaignImage,
} from '../../bridge/campaign-images.js';
import { Button } from '../../components/ui/Button.js';
import { Field } from '../../components/ui/Field.js';
import { ActionIcons } from '../../components/ui/icons.js';
import { ImagePreviewModal } from '../../components/ui/ImagePreviewModal.js';
import { pickImageFilePath } from '../../components/ui/pick-image-file.js';
import { resolveImageDisplayUrlAsync } from '../../components/ui/resolve-local-image-url.js';
import { buildTabularRow } from '../../components/ui/tabular-list.js';
import { FormActionErrorOutlet } from '../../context/AppErrorContext.js';
import { CrudPanel } from '../crud/CrudPanel.js';
import { applyValidationFailure } from '../validation/apply-validation-failure.js';
import { fieldErrorAt } from '../validation/field-error-helpers.js';

import { ImageLinkPicker } from './ImageLinkPicker.js';

type CampaignId = Campaign['id'];

type Props = {
  campaignId: CampaignId;
  onError: (message: string) => void;
};

export function ImagesPanel({ campaignId, onError }: Props): ReactElement {
  const { t } = useTranslation();

  return (
    <CrudPanel<CampaignImage>
      listTitleKey="images.listTitle"
      createKey="images.create"
      emptyKey="images.empty"
      deleteConfirmKey="images.deleteConfirm"
      listFn={() => listCampaignImages(campaignId)}
      deleteFn={deleteCampaignImage}
      getLabel={(img) => img.title}
      showThumbnails
      campaignId={campaignId}
      getListRow={(img) =>
        buildTabularRow({
          title: img.title,
          subtitle: img.caption.trim() || undefined,
          image: img.image,
          details:
            img.links.length > 0 ? [t('images.linkCount', { count: img.links.length })] : undefined,
        })
      }
      onError={onError}
      renderEditor={({ item, onSaved, onCancel, onError: onEditorError }) => (
        <ImageEditor
          campaignId={campaignId}
          image={item}
          onSaved={onSaved}
          onCancel={onCancel}
          onError={onEditorError}
        />
      )}
    />
  );
}

function ImageEditor({
  campaignId,
  image,
  onSaved,
  onCancel,
  onError,
}: {
  campaignId: CampaignId;
  image: CampaignImage | null;
  onSaved: (item: CampaignImage) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const isNew = image === null;

  const [title, setTitle] = useState(image?.title ?? '');
  const [caption, setCaption] = useState(image?.caption ?? '');
  const [visibility, setVisibility] = useState<CampaignImage['visibility']>(
    image?.visibility ?? 'gm_only',
  );
  const [links, setLinks] = useState(image?.links ?? []);
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (pendingFilePath) {
      setPreviewUrl(convertFileSrc(pendingFilePath));
      return;
    }
    let cancelled = false;
    void resolveImageDisplayUrlAsync(campaignId, image?.image ?? null).then((url) => {
      if (!cancelled) setPreviewUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [campaignId, image?.image, pendingFilePath]);

  async function handleChooseFile(): Promise<void> {
    const path = await pickImageFilePath();
    if (path) setPendingFilePath(path);
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setFieldErrors({});
    try {
      const vis = visibilitySchema.parse(visibility);
      if (isNew) {
        const created = await createCampaignImage({
          campaignId,
          title: title.trim(),
          caption,
          visibility: vis,
          links,
        });
        const saved = pendingFilePath
          ? await attachCampaignImageFile(created.id, pendingFilePath)
          : created;
        setPendingFilePath(null);
        onSaved(saved);
        return;
      }
      const updated = await updateCampaignImage({
        id: image.id,
        title: title.trim(),
        caption,
        visibility: vis,
        links,
      });
      const saved = pendingFilePath
        ? await attachCampaignImageFile(image.id, pendingFilePath)
        : updated;
      setPendingFilePath(null);
      onSaved(saved);
    } catch (err) {
      if (!applyValidationFailure(err, t, null, setFieldErrors)) {
        onError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSaving(false);
    }
  }

  const hasSavedFile = Boolean(image?.image?.local);
  const hasPreview = Boolean(previewUrl);
  const chooseLabel =
    hasPreview || pendingFilePath || hasSavedFile
      ? t('images.replaceFile')
      : t('images.chooseFile');

  return (
    <div className="image-editor">
      <div className="image-editor__preview">
        {hasPreview ? (
          <button
            type="button"
            className="image-editor__img-btn"
            onClick={() => setFullscreenPreview(true)}
            aria-label={t('list.openPreview', { name: title || t('images.previewAlt') })}
          >
            <img
              src={previewUrl ?? ''}
              alt={title || t('images.previewAlt')}
              className="image-editor__img"
            />
          </button>
        ) : (
          <p className="empty-state">{t('images.noFile')}</p>
        )}
        <Button
          type="button"
          icon={ActionIcons.edit}
          disabled={saving}
          onClick={() => void handleChooseFile()}
        >
          {chooseLabel}
        </Button>
        {pendingFilePath ? (
          <p className="vault-section-help">{t('images.pendingFileHint')}</p>
        ) : null}
      </div>

      <Field label={t('images.fields.title')} error={fieldErrorAt(fieldErrors, 'title')}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={fieldErrorAt(fieldErrors, 'title') ? true : undefined}
        />
      </Field>

      <Field label={t('images.fields.caption')} error={fieldErrorAt(fieldErrors, 'caption')}>
        <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} />
      </Field>

      <Field label={t('vault.fields.visibility')} error={fieldErrorAt(fieldErrors, 'visibility')}>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as CampaignImage['visibility'])}
        >
          {visibilitySchema.options.map((v: CampaignImage['visibility']) => (
            <option key={v} value={v}>
              {t(`vault.visibility.${v}`)}
            </option>
          ))}
        </select>
      </Field>

      <section className="vault-section">
        <h3>{t('images.fields.links')}</h3>
        <ImageLinkPicker campaignId={campaignId} value={links} onChange={setLinks} />
      </section>

      <ImagePreviewModal
        open={fullscreenPreview && previewUrl !== null}
        src={previewUrl}
        alt={title || t('images.previewAlt')}
        {...(title.trim() ? { title: title.trim() } : {})}
        onClose={() => setFullscreenPreview(false)}
      />

      <FormActionErrorOutlet />
      <div className="crud-editor-actions">
        <Button type="button" icon={ActionIcons.cancel} onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          variant="primary"
          icon={ActionIcons.save}
          disabled={saving || !title.trim()}
          onClick={() => void handleSave()}
        >
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}
