import { AMBER_DISCORD_APPLICATION_ID } from '@amber/shared';
import type { DiscordSDK } from '@discord/embedded-app-sdk';
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

import { initDiscordActivity, type DiscordReadyContext } from '../discord/client.js';

type DiscordContextValue = {
  loading: boolean;
  embedded: boolean;
  channelId: string | null;
  isVoiceChannel: boolean;
  participantId: string | null;
  /** OAuth2 code exchange for session handshake (Activity iframe only). */
  authorizeForHandshake: (() => Promise<{ code: string }>) | null;
};

const DiscordContext = createContext<DiscordContextValue>({
  loading: true,
  embedded: false,
  channelId: null,
  isVoiceChannel: false,
  participantId: null,
  authorizeForHandshake: null,
});

export function DiscordProvider({ children }: { children: ReactNode }): ReactElement {
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState<DiscordReadyContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    void initDiscordActivity()
      .then((ctx) => {
        if (!cancelled) setReady(ctx);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const authorizeForHandshake = useCallback(async (): Promise<{ code: string }> => {
    const sdk: DiscordSDK | null = ready?.discordSdk ?? null;
    if (!sdk) {
      throw new Error('discord_sdk_not_ready');
    }
    return sdk.commands.authorize({
      client_id: AMBER_DISCORD_APPLICATION_ID,
      scope: ['identify', 'guilds'],
      response_type: 'code',
    });
  }, [ready?.discordSdk]);

  const value = useMemo<DiscordContextValue>(
    () => ({
      loading,
      embedded: ready?.embedded ?? false,
      channelId: ready?.channelId ?? null,
      isVoiceChannel: ready?.isVoiceChannel ?? false,
      participantId: ready?.participantId ?? null,
      authorizeForHandshake: ready?.discordSdk ? authorizeForHandshake : null,
    }),
    [loading, ready, authorizeForHandshake],
  );

  return <DiscordContext.Provider value={value}>{children}</DiscordContext.Provider>;
}

export function useDiscordContext(): DiscordContextValue {
  return useContext(DiscordContext);
}
