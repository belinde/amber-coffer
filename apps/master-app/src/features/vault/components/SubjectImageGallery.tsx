import type { Campaign, CampaignImage, ImageLinkKind, ImageRef } from '@amber/shared';
import { LinkSimple, Star, X } from '@phosphor-icons/react';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, BUTTON_ICON_WEIGHT } from '../../../components/ui/Button.js';
import { ImagePreviewModal } from '../../../components/ui/ImagePreviewModal.js';
import { resolveImageDisplayUrlAsync } from '../../../components/ui/resolve-local-image-url.js';
import { removeCampaignImageLink } from '../../images/campaign-image-link-mutations.js';
import { listCampaignImagesLinkedTo } from '../../images/campaign-image-links.js';
import { imageRefHasDisplaySource, imageRefsEqual } from '../../images/image-ref-match.js';
import { NEW_ENTITY_ID } from '../vault-categories.js';

import { LinkCampaignImageDialog } from './LinkCampaignImageDialog.js';

type PreviewState = {
  src: string;
  alt: string;
  title: string;
};

type Props = {
  campaignId: Campaign['id'];
  linkKind: ImageLinkKind;
  entityId: string;
  portraitImage: ImageRef | null | undefined;
  onPortraitChange: (image: ImageRef | null) => void;
  onError?: (message: string) => void;
};

function GalleryThumb({
  campaignId,
  image,
  alt,
  onActivate,
}: {
  campaignId: Campaign['id'];
  image: ImageRef | null | undefined;
  alt: string;
  onActivate: () => void;
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

  return (
    <button type="button" className="subject-image-gallery__thumb-btn" onClick={onActivate}>
      {src ? (
        <img src={src} alt={alt} className="subject-image-gallery__thumb-img" />
      ) : (
        <span className="subject-image-gallery__thumb-placeholder" aria-hidden />
      )}
    </button>
  );
}

export function SubjectImageGallery({
  campaignId,
  linkKind,
  entityId,
  portraitImage,
  onPortraitChange,
  onError,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [items, setItems] = useState<CampaignImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (entityId === NEW_ENTITY_ID) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      setItems(await listCampaignImagesLinkedTo(campaignId, linkKind, entityId));
    } finally {
      setLoading(false);
    }
  }, [campaignId, linkKind, entityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openPreview = useCallback(
    (item: CampaignImage) => {
      if (!item.image) return;
      void resolveImageDisplayUrlAsync(campaignId, item.image).then((src) => {
        if (src) {
          setPreview({
            src,
            alt: item.title,
            title: item.caption.trim() ? `${item.title} — ${item.caption.trim()}` : item.title,
          });
        }
      });
    },
    [campaignId],
  );

  function isDefaultPortrait(item: CampaignImage): boolean {
    return imageRefsEqual(portraitImage, item.image);
  }

  function handleSetDefault(item: CampaignImage): void {
    if (!item.image || !imageRefHasDisplaySource(item.image)) return;
    onPortraitChange({ ...item.image });
  }

  async function handleUnlink(item: CampaignImage): Promise<void> {
    setBusyId(item.id);
    try {
      await removeCampaignImageLink(item, linkKind, entityId);
      if (isDefaultPortrait(item)) {
        onPortraitChange(null);
      }
      await reload();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  function handleLinked(item: CampaignImage): void {
    void reload();
    if (!portraitImage && item.image && imageRefHasDisplaySource(item.image)) {
      onPortraitChange({ ...item.image });
    }
  }

  if (entityId === NEW_ENTITY_ID) {
    return <p className="vault-section-help">{t('vault.linkedImagesSaveFirst')}</p>;
  }

  return (
    <>
      <div className="subject-image-gallery">
        <div className="subject-image-gallery__toolbar">
          <Button
            type="button"
            variant="primary"
            icon={LinkSimple}
            onClick={() => setLinkDialogOpen(true)}
          >
            {t('vault.linkImage')}
          </Button>
        </div>

        {loading ? (
          <p className="empty-state">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <p className="empty-state">{t('vault.imageGalleryEmpty')}</p>
        ) : (
          <ul className="subject-image-gallery__grid">
            {items.map((item) => {
              const isDefault = isDefaultPortrait(item);
              const busy = busyId === item.id;
              return (
                <li key={item.id}>
                  <article
                    className={
                      isDefault
                        ? 'subject-image-gallery__card subject-image-gallery__card--default'
                        : 'subject-image-gallery__card'
                    }
                  >
                    <div className="subject-image-gallery__media">
                      <GalleryThumb
                        campaignId={campaignId}
                        image={item.image}
                        alt={item.title}
                        onActivate={() => openPreview(item)}
                      />
                      <button
                        type="button"
                        className="subject-image-gallery__unlink"
                        disabled={busy}
                        aria-label={t('vault.removeImageLink')}
                        onClick={() => void handleUnlink(item)}
                      >
                        <X size={16} weight={BUTTON_ICON_WEIGHT} />
                      </button>
                      {isDefault ? (
                        <span
                          className="subject-image-gallery__star subject-image-gallery__star--active"
                          aria-label={t('vault.defaultImage')}
                        >
                          <Star size={20} weight="fill" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="subject-image-gallery__star subject-image-gallery__star--action"
                          disabled={busy || !imageRefHasDisplaySource(item.image)}
                          aria-label={t('vault.setDefaultImage')}
                          onClick={() => handleSetDefault(item)}
                        >
                          <Star size={20} weight="regular" />
                        </button>
                      )}
                    </div>
                    <div className="subject-image-gallery__caption">
                      <strong>{item.title}</strong>
                      {item.caption.trim() ? <span>{item.caption.trim()}</span> : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <LinkCampaignImageDialog
        open={linkDialogOpen}
        campaignId={campaignId}
        linkKind={linkKind}
        entityId={entityId}
        onClose={() => setLinkDialogOpen(false)}
        onLinked={handleLinked}
        {...(onError ? { onError } : {})}
      />

      <ImagePreviewModal
        open={preview !== null}
        src={preview?.src ?? null}
        alt={preview?.alt ?? ''}
        {...(preview?.title ? { title: preview.title } : {})}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
