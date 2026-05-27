import type { Campaign, Map as TabletopMap } from '@amber/shared';
import type { ReactElement } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../components/ui/Button.js';
import { ActionIcons } from '../../../components/ui/icons.js';

import { MapBackgroundPicker } from './map-background-picker.js';

type Props = {
  open: boolean;
  campaignId: Campaign['id'];
  currentMapId: TabletopMap['id'];
  onSelect: (campaignImageId: string) => void;
  onUploadNew: () => void;
  onClose: () => void;
};

export function MapBackgroundPickerModal({
  open,
  campaignId,
  currentMapId,
  onSelect,
  onUploadNew,
  onClose,
}: Props): ReactElement | null {
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

  if (!open) return null;

  return createPortal(
    <div
      className="image-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('tabletop.changeMapBackground')}
      onClick={onClose}
    >
      <div className="image-preview-modal__chrome" onClick={(ev) => ev.stopPropagation()}>
        <header className="image-preview-modal__header">
          <p className="image-preview-modal__title">{t('tabletop.changeMapBackground')}</p>
          <Button
            type="button"
            className="btn-icon-only"
            icon={ActionIcons.dismiss}
            aria-label={t('common.dismiss')}
            onClick={onClose}
          />
        </header>
        <div className="image-preview-modal__stage map-background-picker-modal__body">
          <MapBackgroundPicker
            campaignId={campaignId}
            currentMapId={currentMapId}
            onSelect={onSelect}
            onUploadNew={onUploadNew}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
