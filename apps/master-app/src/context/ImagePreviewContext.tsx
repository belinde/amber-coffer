import type { Campaign } from '@amber/shared';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

import type { SessionImageSource } from '../bridge/handouts.js';
import { shareImageAsHandout } from '../bridge/handouts.js';
import { updateMapBackground } from '../bridge/maps.js';
import { formatInvokeErrorMessage } from '../bridge/parse-invoke-error.js';
import { ImagePreviewModal } from '../components/ui/ImagePreviewModal.js';
import { fetchMasterSyncCredentials } from '../features/session-share/fetch-master-sync-credentials.js';
import { bumpTabletopSnapshot } from '../features/tabletop-control/tabletop-sync-bump.js';
import { useTabletopLive } from '../features/tabletop-control/TabletopLiveContext.js';

import { useOptionalActiveSession } from './ActiveSessionContext.js';

export type ImagePreviewRequest = {
  src: string;
  alt: string;
  title?: string;
  campaignId: Campaign['id'];
  imageSource: SessionImageSource;
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
  const [busy, setBusy] = useState(false);

  const openPreview = useCallback((request: ImagePreviewRequest) => {
    setPreview(request);
  }, []);

  const liveSession =
    activeSessionCtx?.activeSession?.playState === 'live' ? activeSessionCtx.activeSession : null;

  async function runSessionAction(action: 'handout' | 'background'): Promise<void> {
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

      if (action === 'handout') {
        await shareImageAsHandout({
          ...base,
          label: preview.title?.trim() || preview.alt,
        });
      } else {
        const mapId = tabletopLive?.activeMapId;
        if (!mapId) {
          onError?.(t('tabletop.backgroundNoActiveMap'));
          return;
        }
        await updateMapBackground({
          ...base,
          mapId,
        });
      }
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
    ? canSetBackground
      ? {
          busy,
          onShowToPlayers: () => void runSessionAction('handout'),
          onSetTableBackground: () => void runSessionAction('background'),
        }
      : {
          busy,
          onShowToPlayers: () => void runSessionAction('handout'),
        }
    : undefined;

  return (
    <ImagePreviewContext.Provider value={contextValue}>
      {children}
      <ImagePreviewModal
        open={preview !== null}
        src={preview?.src ?? null}
        alt={preview?.alt ?? ''}
        {...(preview?.title ? { title: preview.title } : {})}
        onClose={() => setPreview(null)}
        {...(sessionActions ? { sessionActions } : {})}
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
