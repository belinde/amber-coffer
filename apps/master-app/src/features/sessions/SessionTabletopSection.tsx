import { mapIdSchema, type Campaign, type Map, type Token } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createMap, listMaps } from '../../bridge/maps.js';
import { Button } from '../../components/ui/Button.js';
import { listTokens } from '../tabletop-control/bridge.js';
import { TabletopControlView } from '../tabletop-control/TabletopControlView.js';

const activeMapKey = (campaignId: Campaign['id']) => `amber.activeMap.${campaignId}`;

type Props = {
  campaignId: Campaign['id'];
  onError: (message: string) => void;
};

export function SessionTabletopSection({ campaignId, onError }: Props): ReactElement {
  const { t } = useTranslation();
  const [maps, setMaps] = useState<Map[]>([]);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingMap, setCreatingMap] = useState(false);

  const activeMap = maps.find((m) => m.id === activeMapId) ?? null;

  const loadMaps = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listMaps(campaignId);
      setMaps(next);
      const stored = localStorage.getItem(activeMapKey(campaignId));
      const preferred =
        stored && next.some((m) => m.id === stored) ? stored : (next[0]?.id ?? null);
      setActiveMapId(preferred);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [campaignId, onError]);

  const loadTokens = useCallback(async () => {
    if (!activeMapId) {
      setTokens([]);
      return;
    }
    try {
      setTokens(await listTokens(mapIdSchema.parse(activeMapId)));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }, [activeMapId, onError]);

  useEffect(() => {
    void loadMaps();
  }, [loadMaps]);

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

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
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingMap(false);
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
        <TabletopControlView
          campaignId={campaignId}
          map={activeMap}
          tokens={tokens}
          canEdit
          onAfterMove={() => void loadTokens()}
        />
      ) : null}
    </section>
  );
}
