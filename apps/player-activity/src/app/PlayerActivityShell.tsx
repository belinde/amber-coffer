import { Button } from '@amber/ui';
import { useEffect, useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { tabletopStore, useTabletopState } from '../features/tabletop/store.js';
import { TabletopPlayerView } from '../features/tabletop/TabletopPlayerView.js';
import { useTabletopSubscription } from '../features/tabletop/useTabletopSubscription.js';

import { useDiscordContext } from './DiscordContext.js';
import { getSessionErrorPresentation } from './session-error-presentation.js';
import { useSessionSync, useSyncRuntime } from './SessionSyncContext.js';

export function PlayerActivityShell(): ReactElement {
  const { t } = useTranslation();
  const {
    sessionStatus,
    sessionError,
    campaignId,
    sessionId,
    playerDiscordId,
    setSessionStatus,
    retrySessionBootstrap,
  } = useSessionSync();
  const { syncClient } = useSyncRuntime();
  const { embedded, loading: discordLoading, channelId } = useDiscordContext();
  const state = useTabletopState();

  useTabletopSubscription({ client: syncClient, campaignId, sessionId });

  useEffect(() => {
    return tabletopStore.subscribeSessionEnded(() => {
      setSessionStatus('ended');
    });
  }, [setSessionStatus]);

  const activeMap = useMemo(() => {
    if (!state.activeMapId) return null;
    return state.maps.find((m) => m.id === state.activeMapId) ?? null;
  }, [state.activeMapId, state.maps]);

  const discordBadge = discordLoading
    ? t('discord.loading')
    : embedded
      ? t('discord.embedded')
      : t('discord.standalone');

  if (sessionStatus === 'connecting') {
    return (
      <section className="session-shell session-shell--connecting">
        <p className="session-shell__status">{t('session.connecting')}</p>
        <span className="discord-badge">{discordBadge}</span>
      </section>
    );
  }

  if (sessionStatus === 'idle') {
    return (
      <section className="session-shell session-shell--idle">
        <p className="session-shell__status">{t('session.waiting')}</p>
        <span className="discord-badge">{discordBadge}</span>
      </section>
    );
  }

  if (sessionStatus === 'connected' && !activeMap) {
    return (
      <section className="session-shell session-shell--idle">
        <p className="session-shell__status">{t('session.waitingSnapshot')}</p>
        <span className="discord-badge">{discordBadge}</span>
      </section>
    );
  }

  if (sessionStatus === 'ended') {
    return (
      <section className="session-shell session-shell--ended">
        <p className="session-shell__status">{t('session.ended')}</p>
        <span className="discord-badge">{discordBadge}</span>
      </section>
    );
  }

  if (sessionStatus === 'error') {
    const errorView = getSessionErrorPresentation(sessionError, channelId);
    return (
      <section className="session-shell session-shell--error">
        <p className="session-shell__status">{t(errorView.titleKey)}</p>
        {errorView.detailKey ? (
          <p className="session-shell__error-detail">
            {errorView.detailParams
              ? t(errorView.detailKey, errorView.detailParams)
              : t(errorView.detailKey)}
          </p>
        ) : null}
        {errorView.technical ? (
          <p className="session-shell__error-technical">{errorView.technical}</p>
        ) : null}
        {embedded ? (
          <Button
            type="button"
            variant="primary"
            className="session-shell__retry"
            onClick={retrySessionBootstrap}
          >
            {t('session.retry')}
          </Button>
        ) : null}
      </section>
    );
  }

  if (!activeMap) {
    return (
      <section className="session-shell">
        <p className="session-shell__status">{t('session.noMap')}</p>
      </section>
    );
  }

  return (
    <section className="session-shell session-shell--connected">
      <header className="session-shell__header">
        <span className="discord-badge">{discordBadge}</span>
        <span className="session-shell__player-id">{playerDiscordId}</span>
      </header>
      <TabletopPlayerView
        map={activeMap}
        campaignId={campaignId}
        sessionId={sessionId}
        playerDiscordId={playerDiscordId}
        syncClient={syncClient}
      />
    </section>
  );
}
