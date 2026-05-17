import type { Campaign, CampaignImage, ImageRef } from '@amber/shared';
import type { ReactElement } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/Button.js';
import { Field } from '../../components/ui/Field.js';
import { ImagesIcon } from '../../components/ui/icons.js';
import { resolveImageDisplayUrlAsync } from '../../components/ui/resolve-local-image-url.js';
import { fieldErrorAt } from '../validation/field-error-helpers.js';

import {
  filterCampaignImagesByQuery,
  findCampaignImageByRef,
  imageRefHasDisplaySource,
} from './image-ref-match.js';
import { useCampaignImages } from './use-campaign-images.js';

type Props = {
  campaignId: Campaign['id'];
  value: ImageRef | null | undefined;
  onChange: (value: ImageRef | null) => void;
  fieldErrors?: Readonly<Record<string, string>> | undefined;
  onOpenImages?: (() => void) | undefined;
};

function CampaignImageOptionThumb({
  campaignId,
  image,
}: {
  campaignId: Campaign['id'];
  image: ImageRef | null;
}): ReactElement {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolveImageDisplayUrlAsync(campaignId, image).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [campaignId, image]);

  if (!src) {
    return <span className="campaign-image-picker__thumb campaign-image-picker__thumb--empty" aria-hidden />;
  }

  return <img src={src} alt="" className="campaign-image-picker__thumb" />;
}

export function CampaignImagePicker({
  campaignId,
  value,
  onChange,
  fieldErrors,
  onOpenImages,
}: Props): ReactElement {
  const { t } = useTranslation();
  const { images, loading, error, reload } = useCampaignImages(campaignId);
  const inputId = useId();
  const listboxId = useId();

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const matched = useMemo(() => findCampaignImageByRef(images, value), [images, value]);
  const filtered = useMemo(
    () => filterCampaignImagesByQuery(images, query),
    [images, query],
  );

  const selectedLabel = matched?.title;
  const hasUnknownRef = Boolean(value && imageRefHasDisplaySource(value) && !matched);

  useEffect(() => {
    function onDocPointer(ev: PointerEvent): void {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, []);

  function selectImage(item: CampaignImage): void {
    const ref = item.image;
    if (!imageRefHasDisplaySource(ref)) return;
    onChange(ref ? { ...ref } : null);
    setQuery(item.title);
    setOpen(false);
  }

  function clearSelection(): void {
    onChange(null);
    setQuery('');
    setOpen(false);
  }

  const inputValue = open ? query : query || selectedLabel || '';
  const fieldError = fieldErrorAt(fieldErrors, 'image.local') ?? fieldErrorAt(fieldErrors, 'image');

  return (
    <div className="campaign-image-picker" ref={rootRef}>
      <p className="vault-section-help">{t('vault.imageRefHint')}</p>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <Field label={t('vault.fields.portraitImage')} htmlFor={inputId} error={fieldError}>
        <div className="campaign-image-picker__row">
          <div className="subject-picker-autocomplete campaign-image-picker__autocomplete">
            <input
              id={inputId}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-autocomplete="list"
              disabled={loading}
              placeholder={
                loading ? t('subject.loading') : t('vault.imageRefSearchPlaceholder')
              }
              value={inputValue}
              onChange={(ev) => {
                setQuery(ev.target.value);
                setOpen(true);
                if (!ev.target.value.trim()) onChange(null);
              }}
              onFocus={() => {
                reload();
                setQuery(selectedLabel ?? '');
                setOpen(true);
              }}
            />
            {open && !loading ? (
              <ul
                id={listboxId}
                className="subject-autocomplete-list campaign-image-picker__list"
                role="listbox"
              >
                <li role="option">
                  <button
                    type="button"
                    className="subject-autocomplete-option campaign-image-picker__option"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={clearSelection}
                  >
                    {t('common.none')}
                  </button>
                </li>
                {filtered.length === 0 ? (
                  <li className="subject-autocomplete-empty" role="option">
                    {t('vault.imageRefNoResults')}
                  </li>
                ) : (
                  filtered.map((item) => (
                    <li key={item.id} role="option">
                      <button
                        type="button"
                        className="subject-autocomplete-option campaign-image-picker__option"
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => selectImage(item)}
                      >
                        <CampaignImageOptionThumb campaignId={campaignId} image={item.image} />
                        <span className="campaign-image-picker__option-text">
                          <strong>{item.title}</strong>
                          {item.caption ? <span>{item.caption}</span> : null}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>
          {onOpenImages ? (
            <Button type="button" variant="default" icon={ImagesIcon} onClick={onOpenImages}>
              {t('vault.openImagesArchive')}
            </Button>
          ) : null}
        </div>
      </Field>
      {hasUnknownRef ? (
        <p className="vault-section-help campaign-image-picker__orphan">{t('vault.imageRefUnknown')}</p>
      ) : null}
      {matched?.image ? (
        <div className="campaign-image-picker__preview">
          <CampaignImageOptionThumb campaignId={campaignId} image={matched.image} />
          <span className="campaign-image-picker__preview-label">{matched.title}</span>
        </div>
      ) : null}
    </div>
  );
}
