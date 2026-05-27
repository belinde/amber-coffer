import type { Campaign, CampaignImage, Handout, ImageRef } from '@amber/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

import type { SessionImageSource } from '../bridge/handouts.js';
import { hideHandout, shareImageAsHandout } from '../bridge/handouts.js';
import { updateMapBackground } from '../bridge/maps.js';
import { formatInvokeErrorMessage } from '../bridge/parse-invoke-error.js';
import { ImagePreviewModal } from '../components/ui/ImagePreviewModal.js';
import { resolveFullSizeImageUrlAsync } from '../components/ui/resolve-local-image-url.js';
import { fetchMasterSyncCredentials } from '../features/session-share/fetch-master-sync-credentials.js';
import { buildTabletopSnapshot } from '../features/tabletop-control/bridge.js';
import { putSessionSnapshot } from '../features/tabletop-control/session-sync-api.js';
import { bumpTabletopSnapshot } from '../features/tabletop-control/tabletop-sync-bump.js';
import { useTabletopLive } from '../features/tabletop-control/TabletopLiveContext.js';

import { useOptionalActiveSession } from './ActiveSessionContext.js';

export type ImagePreviewRequest = {
  src: string;
  alt: string;
  title?: string;
  campaignId: Campaign['id'];
  imageSource: SessionImageSource;
  imageRef?: ImageRef | undefined;
  campaignImageId?: CampaignImage['id'] | undefined;
};

type ImagePreviewContextValue = {
  openPreview: (request: ImagePreviewRequest) => void;
};

const ImagePreviewContext = createContext<ImagePreviewContextValue | null>(null);

type ProviderProps = {
  children: ReactNode;
  onError?: (message: string) => void;
};

export function ImagePreviewProvider({ children, onError }: ProviderProps): ReactElement {
  const { t } = useTranslation();
  const activeSessionCtx = useOptionalActiveSession();
  const tabletopLive = useTabletopLive();
  const [preview, setPreview] = useState<ImagePreviewRequest | null>(null);
  const [fullSizeSrc, setFullSizeSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharedHandoutId, setSharedHandoutId] = useState<Handout['id'] | null>(null);

  const openPreview = useCallback((request: ImagePreviewRequest) => {
    setPreview(request);
    setSharedHandoutId(null);
    setFullSizeSrc(null);
  }, []);

  // Resolve full-size local image for the modal
  useEffect(() => {
    if (!preview) {
      setFullSizeSrc(null);
      return;
    }
    let cancelled = false;
    void resolveFullSizeImageUrlAsync(preview.campaignId, preview.imageRef ?? null).then((url) => {
      if (!cancelled) setFullSizeSrc(url ?? preview.src);
    });
    return () => {
      cancelled = true;
    };
  }, [preview]);

  const liveSession =
    activeSessionCtx?.activeSession?.playState === 'live' ? activeSessionCtx.activeSession : null;

  async function runShowToPlayers(): Promise<void> {
    if (!preview || !liveSession) return;
    setBusy(true);
    try {
      const creds = await fetchMasterSyncCredentials({
        campaignId: preview.campaignId,
        sessionId: liveSession.id,
      });
      const base = {
        sessionId: liveSession.id,
        sessionToken: creds.sessionToken,
        syncApiBaseUrl: creds.syncApiBaseUrl,
        campaignId: preview.campaignId,
        ...preview.imageSource,
      };

      const handout = await shareImageAsHandout({
        ...base,
        label: preview.title?.trim() || preview.alt,
      });

      // Publish snapshot immediately so the player-activity receives the handout
      // even if the sync poll is not active (user navigated away from session view)
      const activeMapId = tabletopLive?.activeMapId ?? null;
      const snapshot = await buildTabletopSnapshot(liveSession.id, activeMapId);
      await putSessionSnapshot({
        sessionToken: creds.sessionToken,
        campaignId: preview.campaignId,
        sessionId: liveSession.id,
        snapshot,
      });
      bumpTabletopSnapshot();
      setSharedHandoutId(handout.id);
    } catch (err) {
      onError?.(formatInvokeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function runHideFromPlayers(): Promise<void> {
    if (!sharedHandoutId || !liveSession || !preview) return;
    setBusy(true);
    try {
      await hideHandout(sharedHandoutId);

      // Publish snapshot immediately so the player-activity hides the handout
      const creds = await fetchMasterSyncCredentials({
        campaignId: preview.campaignId,
        sessionId: liveSession.id,
      });
      const activeMapId = tabletopLive?.activeMapId ?? null;
      const snapshot = await buildTabletopSnapshot(liveSession.id, activeMapId);
      await putSessionSnapshot({
        sessionToken: creds.sessionToken,
        campaignId: preview.campaignId,
        sessionId: liveSession.id,
        snapshot,
      });
      bumpTabletopSnapshot();
      setSharedHandoutId(null);
      setPreview(null);
    } catch (err) {
      onError?.(formatInvokeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function runSetTableBackground(): Promise<void> {
    if (!preview || !liveSession) return;
    setBusy(true);
    try {
      const creds = await fetchMasterSyncCredentials({
        campaignId: preview.campaignId,
        sessionId: liveSession.id,
      });
      const mapId = tabletopLive?.activeMapId;
      if (!mapId) {
        onError?.(t('tabletop.backgroundNoActiveMap'));
        return;
      }
      await updateMapBackground({
        sessionId: liveSession.id,
        sessionToken: creds.sessionToken,
        syncApiBaseUrl: creds.syncApiBaseUrl,
        campaignId: preview.campaignId,
        ...preview.imageSource,
        mapId,
      });
      bumpTabletopSnapshot();
      setPreview(null);
    } catch (err) {
      onError?.(formatInvokeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const contextValue = useMemo(() => ({ openPreview }), [openPreview]);

  const canSetBackground = Boolean(liveSession && tabletopLive?.activeMapId);

  const sessionActions = liveSession
    ? {
        busy,
        sharedHandoutId,
        onShowToPlayers: () => void runShowToPlayers(),
        onHideFromPlayers: () => void runHideFromPlayers(),
        ...(canSetBackground ? { onSetTableBackground: () => void runSetTableBackground() } : {}),
      }
    : undefined;

  return (
    <ImagePreviewContext.Provider value={contextValue}>
      {children}
      <ImagePreviewModal
        open={preview !== null}
        src={fullSizeSrc ?? preview?.src ?? null}
        alt={preview?.alt ?? ''}
        {...(preview?.title ? { title: preview.title } : {})}
        onClose={() => {
          if (sharedHandoutId) {
            // Hide the handout when closing the modal while it's being shown
            void runHideFromPlayers();
          } else {
            setPreview(null);
          }
        }}
        {...(sessionActions ? { sessionActions } : {})}
        {...(preview?.campaignImageId ? { campaignImageId: preview.campaignImageId } : {})}
        {...(preview?.imageRef ? { imageRef: preview.imageRef } : {})}
        {...(preview?.campaignId ? { campaignId: preview.campaignId } : {})}
      />
    </ImagePreviewContext.Provider>
  );
}

export function useImagePreview(): ImagePreviewContextValue {
  const value = useContext(ImagePreviewContext);
  if (value === null) {
    throw new Error('useImagePreview must be used within ImagePreviewProvider');
  }
  return value;
}

export function useOptionalImagePreview(): ImagePreviewContextValue | null {
  return useContext(ImagePreviewContext);
}
