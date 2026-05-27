import type { Campaign } from '@amber/shared';
import { CloudArrowUp } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listSessions } from '../../bridge/sessions.js';
import { Button } from '../../components/ui/Button.js';
import { fetchMasterSyncCredentials } from '../session-share/fetch-master-sync-credentials.js';

type SyncProgress = {
  current: number;
  total: number;
};

type SyncReport = {
  uploaded: number;
  skipped: number;
  failed: number;
};

type SyncState = 'idle' | 'syncing' | 'success' | 'warning' | 'error';

type Props = {
  campaignId: Campaign['id'];
  onError: (message: string) => void;
};

export function ImageSyncButton({ campaignId, onError }: Props): ReactElement {
  const { t } = useTranslation();
  const [state, setState] = useState<SyncState>('idle');
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const resultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear result notification after a delay
  useEffect(() => {
    return () => {
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
    };
  }, []);

  // Listen to sync-progress Tauri events
  useEffect(() => {
    if (state !== 'syncing') return;

    const unlisten = listen<SyncProgress>('sync-progress', (event) => {
      console.log('[ImageSync] progress:', event.payload);
      setProgress(event.payload);
    });

    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [state]);

  const handleSync = useCallback(async () => {
    if (state === 'syncing') return;

    console.log('[ImageSync] button clicked, campaignId:', campaignId);

    setState('syncing');
    setProgress(null);
    setStatusMessage(t('images.sync.starting'));

    try {
      // Find any session for this campaign to obtain a master token.
      // The image sync APIs only check role=master + campaignId, not sessionId.
      console.log('[ImageSync] looking up sessions for campaign...');
      const sessions = await listSessions(campaignId);
      const session = sessions[0];
      if (!session) {
        const msg = t('images.sync.noSession');
        console.warn('[ImageSync] no sessions found for campaign');
        setState('error');
        setStatusMessage(msg);
        onError(msg);
        return;
      }

      console.log('[ImageSync] using session:', session.id, '— fetching credentials...');
      const creds = await fetchMasterSyncCredentials({
        campaignId,
        sessionId: session.id,
      });
      console.log('[ImageSync] credentials obtained, invoking sync command...');

      const report = await invoke<SyncReport>('sync_campaign_images_cmd', {
        campaignId,
        sessionToken: creds.sessionToken,
        syncApiBaseUrl: creds.syncApiBaseUrl,
      });

      console.log('[ImageSync] sync complete:', report);

      if (report.failed > 0) {
        const msg = t('images.sync.partialFailure', { count: report.failed });
        setState('warning');
        setStatusMessage(msg);
        onError(msg);
      } else {
        const msg = t('images.sync.success', { count: report.uploaded });
        setState('success');
        setStatusMessage(msg);
        resultTimeoutRef.current = setTimeout(() => {
          setState('idle');
          setStatusMessage(null);
        }, 5000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('images.sync.manifestError');
      console.error('[ImageSync] sync failed:', err);
      setState('error');
      setStatusMessage(msg);
      onError(t('images.sync.manifestError'));
    } finally {
      setProgress(null);
    }
  }, [state, campaignId, onError, t]);

  const syncing = state === 'syncing';

  const buttonLabel = syncing
    ? progress
      ? t('images.sync.progress', { current: progress.current, total: progress.total })
      : t('images.sync.starting')
    : t('images.sync.button');

  const progressPercent =
    progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : null;

  return (
    <div className="image-sync-button">
      <div className="image-sync-button__row">
        <Button
          type="button"
          icon={CloudArrowUp}
          disabled={syncing}
          onClick={() => void handleSync()}
          aria-busy={syncing}
        >
          {buttonLabel}
        </Button>

        {syncing && progressPercent !== null ? (
          <div
            className="image-sync-button__progress"
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="image-sync-button__progress-bar"
              style={{ width: `${String(progressPercent)}%` }}
            />
            <span className="image-sync-button__progress-text">{progressPercent}%</span>
          </div>
        ) : null}
      </div>

      {statusMessage && state !== 'syncing' ? (
        <p
          className={`image-sync-button__status image-sync-button__status--${state}`}
          role="status"
        >
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}
