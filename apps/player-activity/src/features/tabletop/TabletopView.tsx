import type { Token } from '@amber/shared';
import {
  BENCH_SLOTS_DEFAULT,
  benchSlotToPercent,
  boardCellToPercent,
} from '@amber/tabletop-engine';
import type { CSSProperties, ReactElement } from 'react';

import { useTabletopState } from './store.js';

const DEFAULT_GRID_SIZE_PX = 50;

/**
 * Read-only tabletop view rendered inside the Discord Activity iframe.
 */
type Props = {
  gridCols: number;
  gridRows: number;
  benchSlots?: number;
  gridSizePx?: number;
  /** CSS aspect-ratio value, e.g. `4 / 3` or `1920 / 1080`. */
  boardAspectRatio?: string;
};

export function TabletopView({
  gridCols,
  gridRows,
  benchSlots = BENCH_SLOTS_DEFAULT,
  gridSizePx = DEFAULT_GRID_SIZE_PX,
  boardAspectRatio = '4 / 3',
}: Props): ReactElement {
  const state = useTabletopState();
  const grid = { cols: gridCols, rows: gridRows };

  const boardTokens = state.tokens.filter((t) => t.position.zone === 'board');
  const benchTokens = state.tokens.filter((t) => t.position.zone === 'bench');

  const boardStyle = {
    '--board-aspect-ratio': boardAspectRatio,
    '--cell-size': `${gridSizePx}px`,
    '--grid-cols': grid.cols,
    '--grid-rows': grid.rows,
  } as CSSProperties;

  return (
    <div className="tabletop-wrap">
      <div className="tabletop-board-area">
        <div className="tabletop-board" style={boardStyle}>
          <div className="tabletop-board__grid" role="application" aria-label="Tabletop">
            {boardTokens.map((token) => (
              <TokenChip key={token.id} token={token} grid={grid} />
            ))}
          </div>
        </div>
      </div>

      <aside className="tabletop-bench" aria-label="Off-board tokens">
        {benchTokens.map((token) => (
          <BenchTokenChip key={token.id} token={token} benchSlots={benchSlots} />
        ))}
      </aside>

      {state.visibleHandouts.length > 0 ? (
        <section className="tabletop-handouts" aria-label="Shared handouts">
          {state.visibleHandouts.map((h) => (
            <article key={h.id} className="tabletop-handout">
              <header>{h.label}</header>
              {h.image?.thumbnailUrl ? <img src={h.image.thumbnailUrl} alt={h.label} /> : null}
              {h.body ? <p>{h.body}</p> : null}
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function TokenChip({
  token,
  grid,
}: {
  token: Token;
  grid: { cols: number; rows: number };
}): ReactElement | null {
  if (token.position.zone !== 'board') return null;
  const style = boardCellToPercent({
    xCell: token.position.xCell,
    yCell: token.position.yCell,
    grid,
  });
  return (
    <div className="tabletop-token" style={style} role="img" aria-label={`Token ${token.entityId}`}>
      <span className="tabletop-token-dot" />
    </div>
  );
}

function BenchTokenChip({
  token,
  benchSlots,
}: {
  token: Token;
  benchSlots: number;
}): ReactElement | null {
  if (token.position.zone !== 'bench') return null;
  const style = benchSlotToPercent({ slot: token.position.slot, benchSlots });
  return (
    <div
      className="tabletop-token tabletop-token--bench"
      style={style}
      role="img"
      aria-label={`Bench token ${token.entityId}`}
    >
      <span className="tabletop-token-dot" />
    </div>
  );
}
