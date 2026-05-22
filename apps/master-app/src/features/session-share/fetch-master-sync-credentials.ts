import type { Campaign, Session } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';

import { discordEnsureUserOauth } from '../../bridge/discord-setup.js';
import {
  fetchMasterSessionToken,
  getSyncApiBaseUrl,
} from '../tabletop-control/session-sync-api.js';

export type MasterSyncCredentials = {
  sessionToken: string;
  syncApiBaseUrl: string;
};

export async function fetchMasterSyncCredentials(args: {
  campaignId: Campaign['id'];
  sessionId: Session['id'];
}): Promise<MasterSyncCredentials> {
  await discordEnsureUserOauth();
  const discordAccessToken = await invoke<string>('discord_user_access_token');
  const issued = await fetchMasterSessionToken({
    campaignId: args.campaignId,
    sessionId: args.sessionId,
    discordAccessToken,
  });
  return {
    sessionToken: issued.sessionToken,
    syncApiBaseUrl: getSyncApiBaseUrl(),
  };
}
