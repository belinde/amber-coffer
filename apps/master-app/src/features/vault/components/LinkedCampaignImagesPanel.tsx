import type { Campaign, CampaignImage, ImageLinkKind } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../components/ui/Button.js';
import { EntityThumbnail } from '../../../components/ui/EntityThumbnail.js';
import { ImagePreviewModal } from '../../../components/ui/ImagePreviewModal.js';
import { resolveImageDisplayUrlAsync } from '../../../components/ui/resolve-local-image-url.js';
import { listCampaignImagesLinkedTo } from '../../images/campaign-image-links.js';
import { NEW_ENTITY_ID } from '../vault-categories.js';

type PreviewState = {
  src: string;
  alt: string;
  title: string;
};

type Props = {
  campaignId: Campaign['id'];
  linkKind: ImageLinkKind;
  entityId: string;
  onOpenImages?: (() => void) | undefined;
};

export function LinkedCampaignImagesPanel({
  campaignId,
  linkKind,
  entityId,
  onOpenImages,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [items, setItems] = useState<CampaignImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PreviewState | null>(null);

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

  if (entityId === NEW_ENTITY_ID) {
    return <p className="vault-section-help">{t('vault.linkedImagesSaveFirst')}</p>;
  }

  if (loading) {
    return <p className="empty-state">{t('common.loading')}</p>;
  }

  return (
    <>
      <p className="vault-section-help">{t('vault.linkedImagesHint')}</p>
      {onOpenImages ? (
        <Button type="button" variant="default" onClick={onOpenImages}>
          {t('vault.openImagesArchive')}
        </Button>
      ) : null}

      {items.length === 0 ? (
        <p className="empty-state">{t('vault.linkedImagesEmpty')}</p>
      ) : (
        <ul className="linked-images-grid">
          {items.map((item) => (
            <li key={item.id}>
              <article className="linked-images-card">
                <EntityThumbnail
                  image={item.image}
                  alt={item.title}
                  size={96}
                  campaignId={campaignId}
                  placeholderKind="image"
                  onPreview={() => openPreview(item)}
                />
                <div className="linked-images-card__text">
                  <strong>{item.title}</strong>
                  {item.caption.trim() ? <p>{item.caption.trim()}</p> : null}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

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
