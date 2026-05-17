import type { Campaign, ImageRef } from '@amber/shared';
import type { ReactElement, ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EntityThumbnail } from './EntityThumbnail.js';
import { ImagePreviewModal } from './ImagePreviewModal.js';
import { resolveImageDisplayUrlAsync } from './resolve-local-image-url.js';
import type { TabularListEntry } from './tabular-list.js';

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
  const interactive = Boolean(onActivate);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const openPreview = useCallback(
    (row: { title: string; image?: ImageRef | null | undefined }) => {
      if (!campaignId || !row.image) return;
      void resolveImageDisplayUrlAsync(campaignId, row.image).then((src) => {
        if (src) setPreview({ src, alt: row.title, title: row.title });
      });
    },
    [campaignId],
  );

  const thumbnailPreviewHandler =
    enableThumbnailPreview && campaignId
      ? (row: { title: string; image?: ImageRef | null | undefined }) => () => openPreview(row)
      : () => undefined;

  return (
    <>
      <div
        className={showThumbnails ? 'tabular-list' : 'tabular-list tabular-list--no-thumb'}
        role={interactive ? undefined : 'table'}
      >
        <div className="tabular-list-header" role="row">
          {showThumbnails ? (
            <span className="tabular-list-col-thumb" role="columnheader">
              {t('list.thumbnail')}
            </span>
          ) : null}
          <span className="tabular-list-col-primary" role="columnheader">
            {t('list.name')}
          </span>
          <span className="tabular-list-col-details" role="columnheader">
            {t('list.details')}
          </span>
          {renderActions ? (
            <span className="tabular-list-col-actions" role="columnheader">
              {t('list.actions')}
            </span>
          ) : null}
        </div>
        <ul className="tabular-list-body">
          {entries.map(({ id, row }) => {
            const primary = (
              <>
                <span className="tabular-list-title">
                  {row.title}
                  {row.badge ? <span className="tabular-list-badge">{row.badge}</span> : null}
                </span>
                {row.subtitle ? <span className="tabular-list-subtitle">{row.subtitle}</span> : null}
              </>
            );

            const details =
              row.details && row.details.length > 0 ? (
                <ul className="tabular-list-details">
                  {row.details.map((detail, index) => (
                    <li key={index}>{detail}</li>
                  ))}
                </ul>
              ) : (
                <span className="tabular-list-details-empty">—</span>
              );

            const onPreview = thumbnailPreviewHandler(row);

            const cells = (
              <>
                {showThumbnails ? (
                  <span className="tabular-list-col-thumb">
                    <EntityThumbnail
                      image={row.image ?? null}
                      alt={row.title}
                      placeholderKind="image"
                      {...(campaignId ? { campaignId } : {})}
                      {...(onPreview ? { onPreview } : {})}
                    />
                  </span>
                ) : null}
                <span className="tabular-list-col-primary">{primary}</span>
                <span className="tabular-list-col-details">{details}</span>
                {renderActions ? (
                  <span className="tabular-list-col-actions">{renderActions(id)}</span>
                ) : null}
              </>
            );

            return (
              <li key={id} className="tabular-list-row">
                {interactive ? (
                  <button
                    type="button"
                    className="tabular-list-row-main"
                    onClick={() => onActivate?.(id)}
                  >
                    {cells}
                  </button>
                ) : (
                  <div className="tabular-list-row-main">{cells}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

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
