import type { Campaign, Map, Session } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { updateMapGridCols } from '../../bridge/maps.js';

import { bumpTabletopSnapshot } from './tabletop-sync-bump.js';

type Props = {
  campaignId: Campaign['id'];
  sessionId: Session['id'];
  map: Pick<Map, 'id' | 'gridCols'>;
  onGridChanged?: (updatedMap: Map) => void;
  onError?: (message: string) => void;
};

const MIN_GRID_COLS = 8;
const MAX_GRID_COLS = 48;

export function GridSizeSlider({
  campaignId,
  sessionId,
  map,
  onGridChanged,
  onError,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [value, setValue] = useState(map.gridCols);
  const [busy, setBusy] = useState(false);

  const handleChange = useCallback(
    async (nextValue: number) => {
      setValue(nextValue);
      setBusy(true);
      try {
        const updated = await updateMapGridCols({
          mapId: map.id,
          campaignId,
          sessionId,
          gridCols: nextValue,
        });
        bumpTabletopSnapshot();
        onGridChanged?.(updated);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [map.id, campaignId, sessionId, onGridChanged, onError],
  );

  const label = t('tabletop.gridSize.label');

  return (
    <label className="session-tabletop__grid-slider">
      <span className="session-tabletop__grid-slider-label">
        {label}: {value}
      </span>
      <input
        type="range"
        min={MIN_GRID_COLS}
        max={MAX_GRID_COLS}
        step={1}
        value={value}
        disabled={busy}
        aria-label={label}
        aria-valuemin={MIN_GRID_COLS}
        aria-valuemax={MAX_GRID_COLS}
        aria-valuenow={value}
        onChange={(e) => void handleChange(Number(e.target.value))}
      />
    </label>
  );
}
