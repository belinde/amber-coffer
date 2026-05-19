import type { DiscordUserId } from '@amber/shared';
import { sessionIdSchema } from '@amber/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { DEMO_PLAYER_A, DEMO_PLAYER_B, DEMO_SESSION_ID_RAW } from '../app/default-session-ids.js';
import { useSessionSync, useSyncRuntime } from '../app/SessionSyncContext.js';

import {
  buildDemoHandout,
  buildSyncEnvelope,
  buildTabletopSnapshotPayload,
  controlTopic,
  DEMO_MAP_ID,
  DEMO_TOKEN_CHARACTER_ID,
  handoutsTopic,
  snapshotTopic,
  tokensTopic,
} from './fixtures/demo-session.js';
import { injectEnvelope } from './SyncDevHarness.js';

export function DevControlPanel(): ReactElement {
  const { t } = useTranslation();
  const { playerDiscordId, setPlayerDiscordId, setSessionStatus } = useSessionSync();
  const { syncClient } = useSyncRuntime();

  function loadSnapshot(): void {
    injectEnvelope(syncClient, snapshotTopic(), buildSyncEnvelope(buildTabletopSnapshotPayload()));
    setSessionStatus('connected');
  }

  function moveOwnedTokenToBench(): void {
    injectEnvelope(
      syncClient,
      tokensTopic(),
      buildSyncEnvelope({
        kind: 'token.moved',
        tokenId: DEMO_TOKEN_CHARACTER_ID,
        mapId: DEMO_MAP_ID,
        position: { zone: 'bench', slot: 0 },
      }),
    );
  }

  function showHandout(): void {
    injectEnvelope(
      syncClient,
      handoutsTopic(),
      buildSyncEnvelope({ kind: 'handout.shown', handout: buildDemoHandout() }),
    );
  }

  function hideHandout(): void {
    injectEnvelope(
      syncClient,
      handoutsTopic(),
      buildSyncEnvelope({
        kind: 'handout.hidden',
        handoutId: buildDemoHandout().id,
      }),
    );
  }

  function endSession(): void {
    injectEnvelope(
      syncClient,
      controlTopic(),
      buildSyncEnvelope({
        kind: 'session.ended',
        sessionId: sessionIdSchema.parse(DEMO_SESSION_ID_RAW),
      }),
    );
    setSessionStatus('ended');
  }

  return (
    <aside className="dev-panel" aria-label={t('dev.panelAria')}>
      <h2 className="dev-panel__title">{t('dev.panelTitle')}</h2>
      <label className="dev-panel__field">
        <span>{t('dev.playerLabel')}</span>
        <select
          value={playerDiscordId}
          onChange={(ev) => setPlayerDiscordId(ev.target.value as DiscordUserId)}
        >
          <option value={DEMO_PLAYER_A}>{t('dev.playerA')}</option>
          <option value={DEMO_PLAYER_B}>{t('dev.playerB')}</option>
        </select>
      </label>
      <div className="dev-panel__actions">
        <button type="button" onClick={loadSnapshot}>
          {t('dev.loadSnapshot')}
        </button>
        <button type="button" onClick={moveOwnedTokenToBench}>
          {t('dev.moveTokenGm')}
        </button>
        <button type="button" onClick={showHandout}>
          {t('dev.showHandout')}
        </button>
        <button type="button" onClick={hideHandout}>
          {t('dev.hideHandout')}
        </button>
        <button type="button" onClick={endSession}>
          {t('dev.endSession')}
        </button>
      </div>
    </aside>
  );
}
