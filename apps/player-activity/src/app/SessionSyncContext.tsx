import type { CampaignId, DiscordUserId, SessionId } from '@amber/shared';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { isAwsHandshakeEnabled } from '../config/api.js';
import { HttpPollSyncClient } from '../sync/http-poll-sync-client.js';
import { InMemorySyncClient } from '../sync/in-memory-sync-client.js';
import type { SyncClientLike } from '../sync/types.js';

import { DEMO_CAMPAIGN_ID, DEMO_PLAYER_A, DEMO_SESSION_ID } from './default-session-ids.js';
import { useDiscordContext } from './DiscordContext.js';
import type { SessionStatus } from './session-types.js';
import type { MqttSessionContextValue } from './session-types.js';
import { useHttpBootstrapEnabled, useHttpSessionBootstrap } from './useHttpSessionBootstrap.js';

export type SessionSyncProviderProps = {
  children: ReactNode;
};

type SyncRuntimeContextValue = MqttSessionContextValue & {
  readonly syncClient: SyncClientLike;
};

const SessionSyncRuntimeContext = createContext<SyncRuntimeContextValue | null>(null);

function readPlayerIdFromQuery(): DiscordUserId | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('playerDiscordId');
  return value && value.length > 0 ? (value as DiscordUserId) : null;
}

function createSyncClient(): SyncClientLike {
  return isAwsHandshakeEnabled() ? new HttpPollSyncClient() : new InMemorySyncClient();
}

export function SessionSyncProvider({ children }: SessionSyncProviderProps): ReactElement {
  const httpEnabled = useHttpBootstrapEnabled();
  const [syncClient] = useState<SyncClientLike>(() => createSyncClient());
  const [campaignId, setCampaignId] = useState<CampaignId>(DEMO_CAMPAIGN_ID);
  const [sessionId, setSessionId] = useState<SessionId>(DEMO_SESSION_ID);
  const [sessionStatus, setSessionStatusState] = useState<SessionStatus>('idle');
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [playerDiscordId, setPlayerDiscordId] = useState<DiscordUserId>(
    () => readPlayerIdFromQuery() ?? DEMO_PLAYER_A,
  );

  const {
    loading: discordLoading,
    embedded,
    channelId,
    isVoiceChannel,
    authorizeForHandshake,
  } = useDiscordContext();

  const setSessionStatus = useCallback((status: SessionStatus, error: string | null = null) => {
    setSessionStatusState(status);
    setSessionError(error);
  }, []);

  const setPlayerDiscordIdFromHandshake = useCallback((id: string) => {
    setPlayerDiscordId(id as DiscordUserId);
  }, []);

  const [bootstrapRetryNonce, setBootstrapRetryNonce] = useState(0);
  const retrySessionBootstrap = useCallback(() => {
    setBootstrapRetryNonce((n) => n + 1);
  }, []);

  useHttpSessionBootstrap({
    enabled: httpEnabled && syncClient instanceof HttpPollSyncClient,
    discordLoading,
    embedded,
    channelId,
    isVoiceChannel,
    authorize: authorizeForHandshake,
    syncClient: syncClient as HttpPollSyncClient,
    setCampaignId,
    setSessionId,
    setPlayerDiscordId: setPlayerDiscordIdFromHandshake,
    setSessionStatus,
    retryNonce: bootstrapRetryNonce,
  });

  const sessionValue = useMemo<MqttSessionContextValue>(
    () => ({
      campaignId,
      sessionId,
      sessionStatus,
      sessionError,
      playerDiscordId,
      setPlayerDiscordId,
      setSessionStatus,
      retrySessionBootstrap,
    }),
    [
      campaignId,
      sessionId,
      sessionStatus,
      sessionError,
      playerDiscordId,
      setSessionStatus,
      retrySessionBootstrap,
    ],
  );

  const runtimeValue = useMemo(() => ({ ...sessionValue, syncClient }), [sessionValue, syncClient]);

  return (
    <SessionSyncRuntimeContext.Provider value={runtimeValue}>
      {children}
    </SessionSyncRuntimeContext.Provider>
  );
}

export function useSessionSync(): MqttSessionContextValue {
  const ctx = useContext(SessionSyncRuntimeContext);
  if (!ctx) {
    throw new Error('useSessionSync must be used within SessionSyncProvider');
  }
  return ctx;
}

export function useSyncRuntime(): SyncRuntimeContextValue {
  const ctx = useContext(SessionSyncRuntimeContext);
  if (!ctx) {
    throw new Error('useSyncRuntime must be used within SessionSyncProvider');
  }
  return ctx;
}

/** @deprecated Use {@link useSessionSync} */
export const useMqttSession = useSessionSync;

/** @deprecated Use {@link useSyncRuntime} */
export function useMqttRuntime(): SyncRuntimeContextValue & { mqttClient: SyncClientLike } {
  const ctx = useSyncRuntime();
  return { ...ctx, mqttClient: ctx.syncClient };
}

/** @deprecated Use {@link SessionSyncProvider} */
export const MqttSessionProvider = SessionSyncProvider;
