import {
  campaignIdSchema,
  discordChannelIdSchema,
  sessionIdSchema,
  type CampaignId,
  type SessionId,
} from '@amber/shared';
import { useEffect, useRef } from 'react';

import { postSessionHandshake, SessionHandshakeError } from '../api/session-handshake.js';
import { getActivityRedirectUri, isAwsHandshakeEnabled } from '../config/api.js';
import type { HttpPollSyncClient } from '../sync/http-poll-sync-client.js';

import type { SessionStatus } from './session-types.js';

type BootstrapArgs = {
  enabled: boolean;
  discordLoading: boolean;
  embedded: boolean;
  channelId: string | null;
  isVoiceChannel: boolean;
  authorize: (() => Promise<{ code: string }>) | null;
  syncClient: HttpPollSyncClient;
  setCampaignId: (id: CampaignId) => void;
  setSessionId: (id: SessionId) => void;
  setPlayerDiscordId: (id: string) => void;
  setSessionStatus: (status: SessionStatus, error?: string | null) => void;
  retryNonce?: number;
};

export function useHttpSessionBootstrap(args: BootstrapArgs): void {
  const {
    enabled,
    discordLoading,
    embedded,
    channelId,
    isVoiceChannel,
    authorize,
    syncClient,
    setCampaignId,
    setSessionId,
    setPlayerDiscordId,
    setSessionStatus,
    retryNonce = 0,
  } = args;

  const lastAttemptKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || discordLoading) {
      return;
    }

    if (!embedded) {
      return;
    }

    if (!channelId || !authorize) {
      setSessionStatus('error', 'discord_channel_unavailable');
      return;
    }

    if (!isVoiceChannel) {
      setSessionStatus('error', 'discord_voice_channel_required');
      return;
    }

    const authorizeHandshake = authorize;
    const attemptKey = `${channelId}:${retryNonce}`;
    if (lastAttemptKeyRef.current === attemptKey) {
      return;
    }
    lastAttemptKeyRef.current = attemptKey;

    let cancelled = false;

    async function run(): Promise<void> {
      setSessionStatus('connecting');
      try {
        const { code } = await authorizeHandshake();
        const handshake = await postSessionHandshake(
          {
            code,
            channelId: discordChannelIdSchema.parse(channelId),
            redirectUri: getActivityRedirectUri({ embedded: true }),
          },
          { useDiscordProxy: true },
        );

        if (cancelled) {
          return;
        }

        const campaignId = campaignIdSchema.parse(handshake.campaignId) as unknown as CampaignId;
        const sessionId = sessionIdSchema.parse(handshake.sessionId) as unknown as SessionId;
        setCampaignId(campaignId);
        setSessionId(sessionId);
        setPlayerDiscordId(handshake.playerDiscordId);

        syncClient.start({
          sessionToken: handshake.sync.sessionToken,
          pollIntervalMs: handshake.sync.pollIntervalMs,
          useDiscordProxy: true,
          callbacks: {
            onSessionEnded: () => {
              if (!cancelled) {
                setSessionStatus('ended');
              }
            },
            onPollError: (err) => {
              if (!cancelled) {
                setSessionStatus('error', err.message);
              }
            },
          },
        });

        if (!cancelled) {
          setSessionStatus('connected');
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message =
          err instanceof SessionHandshakeError
            ? `${err.code}${err.message ? `: ${err.message}` : ''}`
            : err instanceof Error
              ? err.message
              : 'handshake_failed';
        setSessionStatus('error', message);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    discordLoading,
    embedded,
    channelId,
    isVoiceChannel,
    authorize,
    syncClient,
    setCampaignId,
    setSessionId,
    setPlayerDiscordId,
    setSessionStatus,
    retryNonce,
  ]);

  useEffect(() => {
    return () => {
      syncClient.stop();
    };
  }, [syncClient]);
}

export function useHttpBootstrapEnabled(): boolean {
  return isAwsHandshakeEnabled();
}
