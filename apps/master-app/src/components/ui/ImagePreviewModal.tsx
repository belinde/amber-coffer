import type { Campaign, CampaignImage, ClipRegion, Handout, ImageRef } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { triggerBackgroundSync } from '../../features/images/trigger-background-sync.js';
import { TokenClipEditor } from '../../features/tabletop/components/token-clip-editor.js';

import { Button } from './Button.js';
import { ActionIcons } from './icons.js';

type SessionActions = {
  busy: boolean;
  sharedHandoutId: Handout['id'] | null;
  onShowToPlayers: () => void;
  onHideFromPlayers: () => void;
  onSetTableBackground?: () => void;
};

type Props = {
  open: boolean;
  src: string | null;
  alt: string;
  title?: string | undefined;
  onClose: () => void;
  sessionActions?: SessionActions;
  campaignImageId?: CampaignImage['id'];
  imageRef?: ImageRef;
  campaignId?: Campaign['id'];
};

export function ImagePreviewModal({
  open,
  src,
  alt,
  title,
  onClose,
  sessionActions,
  campaignImageId,
  imageRef,
  campaignId,
}: Props): ReactElement | null {
  const { t } = useTranslation();
  const [showClipEditor, setShowClipEditor] = useState(false);
  const [savedClipRegion, setSavedClipRegion] = useState<ClipRegion | null>(null);

  useEffect(() => {
    if (!open) {
      setShowClipEditor(false);
      setSavedClipRegion(null);
      return;
    }
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

  // Load saved clip region when modal opens
  useEffect(() => {
    if (!open || !campaignImageId) {
      setSavedClipRegion(null);
      return;
    }
    void invoke<ClipRegion | null>('get_clip_region_cmd', { campaignImageId })
      .then((clip) => setSavedClipRegion(clip))
      .catch(() => setSavedClipRegion(null));
  }, [open, campaignImageId]);

  const handleClipConfirm = useCallback(
    async (clip: ClipRegion) => {
      if (!campaignImageId) return;
      try {
        await invoke('set_clip_region_cmd', { campaignImageId, clip });
        setShowClipEditor(false);
        if (campaignId) {
          triggerBackgroundSync(campaignId);
        }
      } catch (err) {
        console.error('[ClipEditor] save failed:', err);
      }
    },
    [campaignImageId, campaignId],
  );

  const handleClipRemove = useCallback(async () => {
    if (!campaignImageId) return;
    try {
      await invoke('set_clip_region_cmd', { campaignImageId, clip: null });
      setShowClipEditor(false);
    } catch (err) {
      console.error('[ClipEditor] remove failed:', err);
    }
  }, [campaignImageId]);

  if (!open || !src) return null;

  const heading = title?.trim() || alt;
  const canClipToken = Boolean(campaignImageId && imageRef && campaignId);

  function renderHandoutButton(): ReactElement | null {
    if (!sessionActions) return null;

    if (sessionActions.sharedHandoutId) {
      return (
        <Button
          type="button"
          variant="primary"
          disabled={sessionActions.busy}
          onClick={sessionActions.onHideFromPlayers}
        >
          {sessionActions.busy ? t('images.showToPlayersLoading') : t('images.hideFromPlayers')}
        </Button>
      );
    }

    return (
      <Button
        type="button"
        variant="primary"
        disabled={sessionActions.busy}
        onClick={sessionActions.onShowToPlayers}
      >
        {sessionActions.busy ? t('images.showToPlayersLoading') : t('images.showToPlayers')}
      </Button>
    );
  }

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
        {showClipEditor && campaignImageId && imageRef && campaignId ? (
          <div className="image-preview-modal__clip-editor">
            <TokenClipEditor
              campaignImageId={campaignImageId}
              campaignId={campaignId}
              imageRef={imageRef}
              clipRegion={savedClipRegion}
              onConfirm={(clip) => void handleClipConfirm(clip)}
              onRemove={() => void handleClipRemove()}
            />
          </div>
        ) : (
          <div className="image-preview-modal__stage">
            <img className="image-preview-modal__img" src={src} alt={alt} />
          </div>
        )}
        {sessionActions || canClipToken ? (
          <footer className="image-preview-modal__actions">
            {renderHandoutButton()}
            {sessionActions?.onSetTableBackground ? (
              <Button
                type="button"
                disabled={sessionActions.busy}
                onClick={sessionActions.onSetTableBackground}
              >
                {t('tabletop.setMapBackground')}
              </Button>
            ) : null}
            {canClipToken ? (
              <Button type="button" onClick={() => setShowClipEditor((v) => !v)}>
                {t('images.clipToken')}
              </Button>
            ) : null}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
