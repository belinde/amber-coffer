import type { ReactElement } from 'react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  src: string;
  alt: string;
  onClose: () => void;
};

/**
 * Fullscreen overlay for viewing a handout image at full size.
 * Click anywhere or press Escape to close.
 */
export function HandoutImageOverlay({ src, alt, onClose }: Props): ReactElement {
  const { t } = useTranslation();

  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent): void {
      if (ev.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="handout-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <img className="handout-overlay__img" src={src} alt={alt} />
      <button
        type="button"
        className="handout-overlay__close"
        aria-label={t('tabletop.handoutCloseOverlay')}
        onClick={onClose}
      >
        ✕
      </button>
    </div>
  );
}
