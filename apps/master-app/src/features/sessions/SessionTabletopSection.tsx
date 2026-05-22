import {
  mapIdSchema,
  sessionIdSchema,
  type Campaign,
  type Character,
  type Map,
  type Npc,
  type Session,
  type Token,
} from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listCharacters } from '../../bridge/characters.js';
import { createMap, listMaps, updateMapBackground } from '../../bridge/maps.js';
import { listNpcs } from '../../bridge/npcs.js';
import { formatInvokeErrorMessage, parseInvokeError } from '../../bridge/parse-invoke-error.js';
import { Button } from '../../components/ui/Button.js';
import { pickImageFilePath } from '../../components/ui/pick-image-file.js';
import { fetchMasterSyncCredentials } from '../session-share/fetch-master-sync-credentials.js';
import { ensureCampaignCharacterTokens, listTokens } from '../tabletop-control/bridge.js';
import { buildTokenDisplayMaps } from '../tabletop-control/build-token-display-maps.js';
import { bumpTabletopSnapshot } from '../tabletop-control/tabletop-sync-bump.js';
import { TabletopControlView } from '../tabletop-control/TabletopControlView.js';
import { useTabletopLive } from '../tabletop-control/TabletopLiveContext.js';
import { TabletopTokenManagementPanel } from '../tabletop-control/TabletopTokenManagementPanel.js';
import { useTabletopSyncPoll } from '../tabletop-control/useTabletopSyncPoll.js';
import { translateFieldErrors } from '../validation/translate-validation-issue.js';

const activeMapKey = (campaignId: Campaign['id']) => `amber.activeMap.${campaignId}`;

type Props = {
  campaignId: Campaign['id'];
  sessionId: Session['id'];
  syncEnabled: boolean;
  onError: (message: string) => void;
};

export function SessionTabletopSection({
  campaignId,
  sessionId,
  syncEnabled,
  onError,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [maps, setMaps] = useState<Map[]>([]);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [npcs, setNpcs] = useState<Npc[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingMap, setCreatingMap] = useState(false);
  const [updatingBackground, setUpdatingBackground] = useState(false);
  const tabletopLive = useTabletopLive();

  const reportErr = useCallback(
    (err: unknown) => {
      const validation = parseInvokeError(err);
      if (validation) {
        const mapped = translateFieldErrors(t, validation.issues);
        onError(Object.values(mapped)[0] ?? t('validation.generic.invalid'));
        return;
      }
      onError(formatInvokeErrorMessage(err));
    },
    [onError, t],
  );

  const activeMap = maps.find((m) => m.id === activeMapId) ?? null;

  const { labels, names } = useMemo(
    () => buildTokenDisplayMaps(tokens, characters, npcs),
    [tokens, characters, npcs],
  );

  const loadMaps = useCallback(async () => {
    setLoading(true);
    try {
      await ensureCampaignCharacterTokens(campaignId);
      const next = await listMaps(campaignId);
      setMaps(next);
      const stored = localStorage.getItem(activeMapKey(campaignId));
      const preferred =
        stored && next.some((m) => m.id === stored) ? stored : (next[0]?.id ?? null);
      setActiveMapId(preferred);
    } catch (err) {
      reportErr(err);
    } finally {
      setLoading(false);
    }
  }, [campaignId, reportErr]);

  const loadEntityMeta = useCallback(async () => {
    try {
      const [chars, npcList] = await Promise.all([
        listCharacters(campaignId),
        listNpcs(campaignId),
      ]);
      setCharacters(chars);
      setNpcs(npcList);
    } catch (err) {
      reportErr(err);
    }
  }, [campaignId, reportErr]);

  const loadTokens = useCallback(async () => {
    if (!activeMapId) {
      setTokens([]);
      return;
    }
    try {
      setTokens(await listTokens(mapIdSchema.parse(activeMapId), sessionIdSchema.parse(sessionId)));
    } catch (err) {
      reportErr(err);
    }
  }, [activeMapId, sessionId, reportErr]);

  useEffect(() => {
    void loadMaps();
    void loadEntityMeta();
  }, [loadMaps, loadEntityMeta]);

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

  useTabletopSyncPoll({
    enabled: syncEnabled,
    campaignId,
    sessionId,
    activeMapId,
    onError,
    onTokensChanged: () => void loadTokens(),
  });

  useEffect(() => {
    if (!tabletopLive) return;
    if (syncEnabled) {
      tabletopLive.setTabletopLive(sessionId, activeMapId ? mapIdSchema.parse(activeMapId) : null);
    } else {
      tabletopLive.setTabletopLive(null, null);
    }
    return () => {
      tabletopLive.setTabletopLive(null, null);
    };
  }, [tabletopLive, syncEnabled, sessionId, activeMapId]);

  function selectMap(mapId: string): void {
    setActiveMapId(mapId);
    localStorage.setItem(activeMapKey(campaignId), mapId);
  }

  async function handleCreateDefaultMap(): Promise<void> {
    setCreatingMap(true);
    try {
      const created = await createMap({ campaignId });
      setMaps((prev) => [...prev, created]);
      selectMap(created.id);
    } catch (err) {
      reportErr(err);
    } finally {
      setCreatingMap(false);
    }
  }

  function handleTokensChanged(): void {
    void loadTokens();
    void loadEntityMeta();
  }

  async function handleChangeMapBackground(): Promise<void> {
    if (!activeMap || !syncEnabled) return;
    const sourcePath = await pickImageFilePath();
    if (!sourcePath) return;
    setUpdatingBackground(true);
    try {
      const creds = await fetchMasterSyncCredentials({ campaignId, sessionId });
      const updated = await updateMapBackground({
        mapId: activeMap.id,
        sessionId,
        campaignId,
        sessionToken: creds.sessionToken,
        syncApiBaseUrl: creds.syncApiBaseUrl,
        absoluteSourcePath: sourcePath,
      });
      setMaps((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      bumpTabletopSnapshot();
    } catch (err) {
      reportErr(err);
    } finally {
      setUpdatingBackground(false);
    }
  }

  return (
    <section className="session-tabletop" aria-labelledby="session-tabletop-heading">
      <header className="session-tabletop__header">
        <h3 id="session-tabletop-heading">{t('sessionDetail.tabletopTitle')}</h3>
        {maps.length > 1 ? (
          <label className="session-tabletop__map-select">
            <span className="session-tabletop__map-select-label">
              {t('sessionDetail.selectMap')}
            </span>
            <select value={activeMapId ?? ''} onChange={(e) => selectMap(e.target.value)}>
              {maps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.name}
                </option>
              ))}
            </select>
          </label>
        ) : activeMap ? (
          <span className="session-tabletop__map-name">{activeMap.name}</span>
        ) : null}
        {syncEnabled && activeMap ? (
          <Button
            type="button"
            disabled={updatingBackground}
            onClick={() => void handleChangeMapBackground()}
          >
            {updatingBackground ? t('common.saving') : t('tabletop.changeMapBackground')}
          </Button>
        ) : null}
      </header>

      {loading ? <p className="empty-state">{t('common.loading')}</p> : null}

      {!loading && maps.length === 0 ? (
        <div className="session-tabletop__empty">
          <p>{t('sessionDetail.noMaps')}</p>
          <Button
            type="button"
            variant="primary"
            disabled={creatingMap}
            onClick={() => void handleCreateDefaultMap()}
          >
            {creatingMap ? t('common.saving') : t('sessionDetail.createDefaultMap')}
          </Button>
        </div>
      ) : null}

      {!loading && activeMap ? (
        <div className="session-tabletop__layout">
          <TabletopTokenManagementPanel
            campaignId={campaignId}
            sessionId={sessionId}
            activeMap={activeMap}
            tokens={tokens}
            onTokensChanged={handleTokensChanged}
            onError={onError}
          />
          <TabletopControlView
            campaignId={campaignId}
            map={activeMap}
            tokens={tokens}
            tokenLabels={labels}
            tokenNames={names}
            canEdit
            onAfterMove={handleTokensChanged}
          />
        </div>
      ) : null}
    </section>
  );
}
