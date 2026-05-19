import type {
  Campaign,
  CampaignImage,
  Character,
  ImageLink,
  ImageLinkKind,
  Location,
  Npc,
  Session,
} from '@amber/shared';
import { Plus } from '@phosphor-icons/react';
import type { ReactElement } from 'react';
import { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { attachCampaignImageFile, createCampaignImage } from '../../../bridge/campaign-images.js';
import { Button } from '../../../components/ui/Button.js';
import { ActionIcons } from '../../../components/ui/icons.js';
import { pickImageFilePath } from '../../../components/ui/pick-image-file.js';
import { resolveImageDisplayUrlAsync } from '../../../components/ui/resolve-local-image-url.js';
import {
  addCampaignImageLink,
  campaignImageHasLink,
} from '../../images/campaign-image-link-mutations.js';
import {
  filterCampaignImagesByQuery,
  imageRefHasDisplaySource,
} from '../../images/image-ref-match.js';
import { useCampaignImages } from '../../images/use-campaign-images.js';

type Props = {
  open: boolean;
  campaignId: Campaign['id'];
  linkKind: ImageLinkKind;
  entityId: string;
  onClose: () => void;
  onLinked: (item: CampaignImage) => void;
  onError?: (message: string) => void;
};

function OptionThumb({
  campaignId,
  image,
}: {
  campaignId: Campaign['id'];
  image: CampaignImage['image'];
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
    return (
      <span className="link-campaign-image-dialog__thumb link-campaign-image-dialog__thumb--empty" />
    );
  }

  return <img src={src} alt="" className="link-campaign-image-dialog__thumb" />;
}

export function LinkCampaignImageDialog({
  open,
  campaignId,
  linkKind,
  entityId,
  onClose,
  onLinked,
  onError,
}: Props): ReactElement | null {
  const { t } = useTranslation();
  const { images, loading, reload } = useCampaignImages(campaignId);
  const titleId = useId();
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    reload();
    setQuery('');
  }, [open, reload]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(ev: KeyboardEvent): void {
      if (ev.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const link: ImageLink = useMemo(() => {
    switch (linkKind) {
      case 'character':
        return { kind: 'character', id: entityId as Character['id'] };
      case 'npc':
        return { kind: 'npc', id: entityId as Npc['id'] };
      case 'location':
        return { kind: 'location', id: entityId as Location['id'] };
      case 'session':
        return { kind: 'session', id: entityId as Session['id'] };
    }
  }, [linkKind, entityId]);

  const available = useMemo(() => {
    const withFile = images.filter(
      (item) =>
        imageRefHasDisplaySource(item.image) && !campaignImageHasLink(item, linkKind, entityId),
    );
    return filterCampaignImagesByQuery(withFile, query);
  }, [images, linkKind, entityId, query]);

  async function handleSelect(item: CampaignImage): Promise<void> {
    try {
      const updated = await addCampaignImageLink(item, link);
      onLinked(updated);
      onClose();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleUploadNew(): Promise<void> {
    const path = await pickImageFilePath();
    if (!path) return;

    const fileName = path.split(/[/\\]/).pop() ?? '';
    const title =
      fileName
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .trim() || t('vault.newLinkedImageTitle');

    setUploading(true);
    try {
      const created = await createCampaignImage({
        campaignId,
        title,
        caption: '',
        visibility: 'gm_only',
        links: [link],
      });
      const saved = await attachCampaignImageFile(created.id, path);
      onLinked(saved);
      onClose();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      className="link-campaign-image-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="link-campaign-image-dialog__backdrop"
        aria-label={t('common.close')}
        onClick={onClose}
      />
      <div className="link-campaign-image-dialog__panel">
        <header className="link-campaign-image-dialog__header">
          <h3 id={titleId} className="link-campaign-image-dialog__title">
            {t('vault.linkImageDialogTitle')}
          </h3>
          <Button type="button" variant="default" icon={ActionIcons.cancel} onClick={onClose}>
            {t('common.close')}
          </Button>
        </header>

        <div className="link-campaign-image-dialog__search">
          <label htmlFor={searchId} className="visually-hidden">
            {t('vault.imageRefSearchPlaceholder')}
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            disabled={loading || uploading}
            placeholder={t('vault.imageRefSearchPlaceholder')}
            onChange={(ev) => setQuery(ev.target.value)}
          />
        </div>

        <ul className="link-campaign-image-dialog__list">
          {loading ? (
            <li className="link-campaign-image-dialog__empty">{t('common.loading')}</li>
          ) : available.length === 0 ? (
            <li className="link-campaign-image-dialog__empty">{t('vault.imageRefNoResults')}</li>
          ) : (
            available.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="link-campaign-image-dialog__option"
                  onClick={() => void handleSelect(item)}
                >
                  <OptionThumb campaignId={campaignId} image={item.image} />
                  <span className="link-campaign-image-dialog__option-text">
                    <strong>{item.title}</strong>
                    {item.caption.trim() ? <span>{item.caption.trim()}</span> : null}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>

        <footer className="link-campaign-image-dialog__footer">
          <Button
            type="button"
            variant="primary"
            icon={Plus}
            disabled={uploading}
            onClick={() => void handleUploadNew()}
          >
            {t('vault.uploadNewImage')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
