import type { Campaign } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';

import { listSessions } from '../../bridge/sessions.js';
import { fetchMasterSyncCredentials } from '../session-share/fetch-master-sync-credentials.js';

/**
 * Fire-and-forget background sync attempt for campaign images.
 * Silently resolves — never throws, never shows UI notifications.
 */
export function triggerBackgroundSync(campaignId: Campaign['id']): void {
  void (async () => {
    try {
      console.log('[BackgroundSync] looking up sessions for campaign:', campaignId);
      const sessions = await listSessions(campaignId);
      const session = sessions[0];
      if (!session) {
        console.log('[BackgroundSync] no session found, skipping sync');
        return;
      }

      console.log('[BackgroundSync] fetching credentials via session:', session.id);
      const creds = await fetchMasterSyncCredentials({
        campaignId,
        sessionId: session.id,
      });

      console.log('[BackgroundSync] invoking sync_campaign_images_cmd...');
      const report = await invoke<{ uploaded: number; skipped: number; failed: number }>(
        'sync_campaign_images_cmd',
        {
          campaignId,
          sessionToken: creds.sessionToken,
          syncApiBaseUrl: creds.syncApiBaseUrl,
        },
      );

      console.log('[BackgroundSync] complete:', report);
    } catch (err) {
      console.warn('[BackgroundSync] failed (silent):', err);
    }
  })();
}
