import type { Campaign, ImageRef } from '@amber/shared';
import { Image as ImageIcon, User } from '@phosphor-icons/react';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BUTTON_ICON_WEIGHT } from './Button.js';
import { resolveImageDisplayUrl } from './resolve-image-src.js';
import { resolveImageDisplayUrlAsync } from './resolve-local-image-url.js';

type Props = {
  image?: ImageRef | null;
  alt: string;
  size?: number;
  campaignId?: Campaign['id'];
  /** When set and a URL resolves, the thumbnail is a button that calls this handler. */
  onPreview?: (() => void) | undefined;
  placeholderKind?: 'entity' | 'image';
};

export function EntityThumbnail({
  image,
  alt,
  size = 48,
  campaignId,
  onPreview,
  placeholderKind = 'entity',
}: Props): ReactElement {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(() => resolveImageDisplayUrl(image));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    const remote = resolveImageDisplayUrl(image);
    if (remote) {
      setSrc(remote);
      return;
    }
    if (!image?.local || !campaignId) {
      setSrc(null);
      return;
    }
    void resolveImageDisplayUrlAsync(campaignId, image)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) {
          setSrc(null);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, image]);

  const canPreview = Boolean(src && onPreview);
  const PlaceholderIcon = placeholderKind === 'image' ? ImageIcon : User;

  if (src && !failed) {
    const img = (
      <img
        className="entity-thumbnail"
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );

    if (canPreview) {
      return (
        <div
          role="button"
          tabIndex={0}
          className="entity-thumbnail-btn"
          onClick={(ev) => {
            ev.stopPropagation();
            onPreview?.();
          }}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              ev.stopPropagation();
              onPreview?.();
            }
          }}
          aria-label={t('list.openPreview', { name: alt })}
          style={{ width: size, height: size }}
        >
          {img}
        </div>
      );
    }

    return img;
  }

  return (
    <span
      className="entity-thumbnail entity-thumbnail-placeholder"
      style={{ width: size, height: size }}
      aria-hidden={!failed}
      title={failed ? t('images.thumbnailFailed') : undefined}
    >
      <PlaceholderIcon size={Math.round(size * 0.45)} weight={BUTTON_ICON_WEIGHT} />
      <span className="visually-hidden">{t('list.noThumbnail')}</span>
    </span>
  );
}
