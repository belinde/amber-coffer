import type { ReactElement } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { Button } from './Button.js';
import { ActionIcons } from './icons.js';

type Props = {
  open: boolean;
  src: string | null;
  alt: string;
  title?: string | undefined;
  onClose: () => void;
};

export function ImagePreviewModal({ open, src, alt, title, onClose }: Props): ReactElement | null {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(ev: KeyboardEvent): void {
      if (ev.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !src) return null;

  const heading = title?.trim() || alt;

  return createPortal(
    <div
      className="image-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      onClick={onClose}
    >
      <div className="image-preview-modal__chrome" onClick={(ev) => ev.stopPropagation()}>
        <header className="image-preview-modal__header">
          <p className="image-preview-modal__title">{heading}</p>
          <Button
            type="button"
            className="btn-icon-only"
            icon={ActionIcons.dismiss}
            aria-label={t('images.closePreview')}
            onClick={onClose}
          />
        </header>
        <div className="image-preview-modal__stage">
          <img className="image-preview-modal__img" src={src} alt={alt} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
