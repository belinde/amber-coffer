import type { Campaign } from '@amber/shared';
import { mqttMessageSchema } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { getCampaign } from '../../bridge/campaigns.js';
import { discordEnsureUserOauth } from '../../bridge/discord-setup.js';

import { resolveTokenMoveRequest } from './bridge.js';
import {
  fetchMasterSessionToken,
  formatMasterSyncPollError,
  getSessionSyncState,
  isPlayerMoveRequest,
  MasterSessionTokenError,
  putSessionSnapshot,
} from './session-sync-api.js';
import { registerTabletopSnapshotBump } from './tabletop-sync-bump.js';

const DEFAULT_POLL_MS = 2000;

function hashSnapshot(snapshot: unknown): string {
  return JSON.stringify(snapshot);
}

type Args = {
  enabled: boolean;
  campaignId: Campaign['id'];
  sessionId: string;
  activeMapId: string | null;
  onError?: (message: string) => void;
  onTokensChanged?: () => void;
};

export function useTabletopSyncPoll(args: Args): void {
  const { enabled, campaignId, sessionId, activeMapId, onError, onTokensChanged } = args;
  const onTokensChangedRef = useRef(onTokensChanged);
  onTokensChangedRef.current = onTokensChanged;
  const { t } = useTranslation();
  const lastPublishedHashRef = useRef<string | null>(null);
  const lastVersionRef = useRef(0);
  const sessionTokenRef = useRef<string | null>(null);
  const pollMsRef = useRef(DEFAULT_POLL_MS);
  const runningRef = useRef(false);
  const discordRetryRef = useRef(false);
  const discordChannelIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      runningRef.current = false;
      sessionTokenRef.current = null;
      discordRetryRef.current = false;
      discordChannelIdRef.current = null;
      return;
    }

    runningRef.current = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const unregisterBump = registerTabletopSnapshotBump(() => {
      lastPublishedHashRef.current = null;
    });

    function reportError(err: unknown): void {
      const key = formatMasterSyncPollError(err);
      if (key.startsWith('sessionSync.')) {
        const code =
          err instanceof MasterSessionTokenError && key === 'sessionSync.errors.tokenFailed'
            ? err.code
            : undefined;
        onError?.(code !== undefined ? t(key, { code }) : t(key));
        return;
      }
      onError?.(key);
    }

    async function ensureToken(forceDiscordRefresh = false): Promise<string | null> {
      if (sessionTokenRef.current && !forceDiscordRefresh) {
        return sessionTokenRef.current;
      }
      sessionTokenRef.current = null;

      try {
        await discordEnsureUserOauth();
        const discordAccessToken = await invoke<string>('discord_user_access_token');
        const issued = await fetchMasterSessionToken({
          campaignId,
          sessionId,
          discordAccessToken,
          channelId: discordChannelIdRef.current ?? undefined,
        });
        sessionTokenRef.current = issued.sessionToken;
        pollMsRef.current = issued.pollIntervalMs;
        discordRetryRef.current = false;
        return issued.sessionToken;
      } catch (err) {
        if (
          err instanceof MasterSessionTokenError &&
          err.code === 'discord_auth_failed' &&
          !discordRetryRef.current
        ) {
          discordRetryRef.current = true;
          return ensureToken(true);
        }
        reportError(err);
        return null;
      }
    }

    async function tick(): Promise<void> {
      if (!runningRef.current) {
        return;
      }

      try {
        const campaign = await getCampaign(campaignId);
        discordChannelIdRef.current = campaign?.discordChannelId ?? null;
      } catch (err) {
        reportError(err);
      }

      const token = await ensureToken();
      if (!token) {
        timer = setTimeout(() => void tick(), pollMsRef.current);
        return;
      }

      try {
        const snapshot = await invoke<unknown>('build_tabletop_snapshot_json', {
          sessionId,
          activeMapId,
        });
        const snapshotHash = hashSnapshot(snapshot);
        if (snapshotHash !== lastPublishedHashRef.current) {
          await putSessionSnapshot({
            sessionToken: token,
            campaignId,
            sessionId,
            snapshot,
          });
          lastPublishedHashRef.current = snapshotHash;
        }

        const stateResult = await getSessionSyncState({
          sessionToken: token,
          sinceVersion: lastVersionRef.current,
        });

        if (stateResult.status === 200) {
          if (stateResult.state.version > lastVersionRef.current) {
            lastVersionRef.current = stateResult.state.version;
          }

          let acceptedMove = false;
          for (const raw of stateResult.state.pendingEvents) {
            const event = mqttMessageSchema.parse(raw);
            if (!isPlayerMoveRequest(event)) {
              continue;
            }
            const result = (await resolveTokenMoveRequest({
              tokenId: event.tokenId,
              accepted: true,
              finalPosition: event.requestedPosition,
              requesterDiscordId: event.senderDiscordId ?? null,
            })) as { accepted?: boolean };
            if (result.accepted) {
              acceptedMove = true;
            }
          }
          if (acceptedMove) {
            lastPublishedHashRef.current = null;
            onTokensChangedRef.current?.();
          }
        }
      } catch (err) {
        if (err instanceof MasterSessionTokenError && err.status === 401) {
          sessionTokenRef.current = null;
        }
        reportError(err);
      }

      timer = setTimeout(() => void tick(), pollMsRef.current);
    }

    void tick();

    return () => {
      runningRef.current = false;
      unregisterBump();
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [enabled, campaignId, sessionId, activeMapId, onError, t]);
}
