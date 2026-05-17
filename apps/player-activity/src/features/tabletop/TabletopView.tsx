import type { Token } from '@amber/shared';
import {
  BENCH_SLOTS_DEFAULT,
  benchSlotToPercent,
  boardCellToPercent,
} from '@amber/tabletop-engine';
import type { CSSProperties, ReactElement } from 'react';

import { useTabletopState } from './store.js';

/**
 * Read-only tabletop view rendered inside the Discord Activity iframe.
 *
 * Decisions reflected here:
 * - D1 cell coordinates → tokens carry `position` (board or bench)
 * - D2 bench off-board → renderiamo una colonna laterale `tabletop-bench`
 * - D3 player moves own token → not yet wired (sends `token.move.request` via MQTT in a follow-up)
 *
 * The CSS classes (`tabletop-board`, `tabletop-bench`, ...) match the legacy POC so we can
 * iterate on the stylesheet without renaming markup.
 */
type Props = {
  gridCols: number;
  gridRows: number;
  benchSlots?: number;
};

export function TabletopView({ gridCols, gridRows, benchSlots = BENCH_SLOTS_DEFAULT }: Props): ReactElement {
  const state = useTabletopState();
  const grid = { cols: gridCols, rows: gridRows };

  const boardTokens = state.tokens.filter((t) => t.position.zone === 'board');
  const benchTokens = state.tokens.filter((t) => t.position.zone === 'bench');

  return (
    <div className="tabletop-wrap">
      <div
        className="tabletop-board tabletop-grid"
        role="application"
        aria-label="Tabletop"
        style={
          {
            '--grid-cols': grid.cols,
            '--grid-rows': grid.rows,
          } as CSSProperties
        }
      >
        {boardTokens.map((token) => (
          <TokenChip key={token.id} token={token} grid={grid} />
        ))}
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

function TokenChip({ token, grid }: { token: Token; grid: { cols: number; rows: number } }): ReactElement | null {
  if (token.position.zone !== 'board') return null;
  const style = boardCellToPercent({ xCell: token.position.xCell, yCell: token.position.yCell, grid });
  return (
    <div className="tabletop-token" style={style} role="img" aria-label={`Token ${token.entityId}`}>
      <span className="tabletop-token-dot" />
    </div>
  );
}

function BenchTokenChip({ token, benchSlots }: { token: Token; benchSlots: number }): ReactElement | null {
  if (token.position.zone !== 'bench') return null;
  const style = benchSlotToPercent({ slot: token.position.slot, benchSlots });
  return (
    <div className="tabletop-token tabletop-token--bench" style={style} role="img" aria-label={`Bench token ${token.entityId}`}>
      <span className="tabletop-token-dot" />
    </div>
  );
}
