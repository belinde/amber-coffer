import type { Campaign } from '@amber/shared';
import { TabularList as UiTabularList, type TabularListEntry } from '@amber/ui';
import type { ReactElement, ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { imageRefToSessionSource } from '../../bridge/handouts.js';
import { useOptionalImagePreview } from '../../context/ImagePreviewContext.js';

import { EntityThumbnail } from './EntityThumbnail.js';
import { ImagePreviewModal } from './ImagePreviewModal.js';
import { resolveImageDisplayUrlAsync } from './resolve-local-image-url.js';

type PreviewState = {
  src: string;
  alt: string;
  title: string;
};

type Props = {
  entries: TabularListEntry[];
  showThumbnails?: boolean;
  campaignId?: Campaign['id'];
  enableThumbnailPreview?: boolean;
  onActivate?: (id: string) => void;
  renderActions?: (id: string) => ReactNode;
};

export function TabularList({
  entries,
  showThumbnails = true,
  campaignId,
  enableThumbnailPreview = true,
  onActivate,
  renderActions,
}: Props): ReactElement {
  const { t } = useTranslation();
  const imagePreview = useOptionalImagePreview();
  const [localPreview, setLocalPreview] = useState<PreviewState | null>(null);

  const labels = useMemo(
    () => ({
      thumbnail: t('list.thumbnail'),
      name: t('list.name'),
      details: t('list.details'),
      actions: t('list.actions'),
    }),
    [t],
  );

  const openPreview = useCallback(
    (row: TabularListEntry['row']) => {
      if (!campaignId || !row.image) return;
      void resolveImageDisplayUrlAsync(campaignId, row.image).then((src) => {
        if (!src) return;
        const imageSource = imageRefToSessionSource(row.image);
        if (imagePreview && imageSource) {
          imagePreview.openPreview({
            src,
            alt: row.title,
            title: row.title,
            campaignId,
            imageSource,
            imageRef: row.image ?? undefined,
          });
          return;
        }
        setLocalPreview({ src, alt: row.title, title: row.title });
      });
    },
    [campaignId, imagePreview],
  );

  const canPreview = enableThumbnailPreview && Boolean(campaignId);

  function renderThumbnail(entry: TabularListEntry): ReactElement {
    const onPreview = canPreview ? () => openPreview(entry.row) : undefined;
    return (
      <EntityThumbnail
        image={entry.row.image ?? null}
        alt={entry.row.title}
        placeholderKind="image"
        {...(campaignId ? { campaignId } : {})}
        {...(onPreview ? { onPreview } : {})}
      />
    );
  }

  return (
    <>
      <UiTabularList
        entries={entries}
        labels={labels}
        showThumbnails={showThumbnails}
        {...(onActivate ? { onActivate } : {})}
        {...(renderActions ? { renderActions } : {})}
        {...(showThumbnails ? { renderThumbnail } : {})}
      />
      {!imagePreview ? (
        <ImagePreviewModal
          open={localPreview !== null}
          src={localPreview?.src ?? null}
          alt={localPreview?.alt ?? ''}
          {...(localPreview?.title ? { title: localPreview.title } : {})}
          onClose={() => setLocalPreview(null)}
        />
      ) : null}
    </>
  );
}
