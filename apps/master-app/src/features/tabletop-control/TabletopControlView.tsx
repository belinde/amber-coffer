import type { Token } from '@amber/shared';
import {
  BENCH_SLOTS_DEFAULT,
  benchSlotToPercent,
  boardCellToPercent,
  cellKey,
  nearestFreeBenchSlot,
  nearestFreeBoardCell,
  positionKey,
  pxToBenchSlot,
  pxToBoardCell,
} from '@amber/tabletop-engine';
import type { CSSProperties, PointerEvent, ReactElement } from 'react';
import { useMemo, useRef, useState } from 'react';

import { moveToken } from './bridge.js';

type Grid = { cols: number; rows: number; benchSlots: number };
type RuntimeTokenId = Token['id'];
type RuntimeTokenPosition = Token['position'];

type Props = {
  grid: Pick<Grid, 'cols' | 'rows'> & { benchSlots?: number };
  tokens: Token[];
  /** When false, the Master cannot drag tokens (e.g. read-only review mode). */
  canEdit?: boolean;
  /** Called after a successful `move_token` IPC (e.g. reload tokens). */
  onAfterMove?: () => void;
};

type DragState = {
  tokenId: RuntimeTokenId;
  pointerId: number;
  ghostPosition: RuntimeTokenPosition;
};

/**
 * Master-authoritative editor for the tabletop. Drag and drop produces a final position
 * snapped to the nearest free cell (or bench slot) and dispatches `move_token` via Tauri.
 *
 * The visual layer mirrors the legacy POC (cell-based grid + vertical bench column);
 * the geometry comes from `@amber/tabletop-engine`. Per ADR 0002 the SQLite writes happen
 * exclusively in Rust through the `move_token` command.
 */
export function TabletopControlView({ grid, tokens, canEdit = true, onAfterMove }: Props): ReactElement {
  const gridConfig: Grid = {
    cols: grid.cols,
    rows: grid.rows,
    benchSlots: grid.benchSlots ?? BENCH_SLOTS_DEFAULT,
  };

  const boardRef = useRef<HTMLDivElement | null>(null);
  const benchRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const occupiedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const token of tokens) set.add(positionKey(token.position));
    return set;
  }, [tokens]);

  function resolvePosition(
    rawClientX: number,
    rawClientY: number,
    excludeTokenId: RuntimeTokenId | null,
  ): RuntimeTokenPosition {
    const boardRect = boardRef.current?.getBoundingClientRect();
    const benchRect = benchRef.current?.getBoundingClientRect();
    const occ = new Set(occupiedKeys);
    if (excludeTokenId) {
      const self = tokens.find((t) => t.id === excludeTokenId);
      if (self) occ.delete(positionKey(self.position));
    }
    if (boardRect && pointerInRect(rawClientX, rawClientY, boardRect)) {
      const raw = pxToBoardCell({
        clientX: rawClientX,
        clientY: rawClientY,
        rect: boardRect,
        grid: gridConfig,
      });
      const free = nearestFreeBoardCell({
        start: raw,
        grid: gridConfig,
        occupied: occ,
      });
      return { zone: 'board', xCell: free.xCell, yCell: free.yCell };
    }
    if (benchRect) {
      const raw = pxToBenchSlot({
        clientY: rawClientY,
        rect: benchRect,
        benchSlots: gridConfig.benchSlots,
      });
      const free = nearestFreeBenchSlot({
        startSlot: raw.slot,
        benchSlots: gridConfig.benchSlots,
        occupied: occ,
      });
      return { zone: 'bench', slot: free.slot };
    }
    return { zone: 'bench', slot: 0 };
  }

  function startDrag(ev: PointerEvent, token: Token): void {
    if (!canEdit) return;
    const ghost = resolvePosition(ev.clientX, ev.clientY, token.id);
    setDrag({ tokenId: token.id, pointerId: ev.pointerId, ghostPosition: ghost });
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  }

  function onPointerMove(ev: PointerEvent): void {
    if (!drag) return;
    if (ev.pointerId !== drag.pointerId) return;
    const ghost = resolvePosition(ev.clientX, ev.clientY, drag.tokenId);
    if (positionKey(ghost) === positionKey(drag.ghostPosition)) return;
    setDrag({ ...drag, ghostPosition: ghost });
  }

  function endDrag(ev: PointerEvent): void {
    if (!drag) return;
    if (ev.pointerId !== drag.pointerId) return;
    const finalPosition = drag.ghostPosition;
    const tokenId = drag.tokenId;
    setDrag(null);
    void moveToken({ tokenId, position: finalPosition })
      .then(() => onAfterMove?.())
      .catch(() => undefined);
  }

  return (
    <div className="tabletop-wrap" onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <div
        ref={boardRef}
        className="tabletop-board tabletop-grid"
        role="application"
        aria-label="Tabletop control"
        style={
          {
            '--grid-cols': gridConfig.cols,
            '--grid-rows': gridConfig.rows,
          } as CSSProperties
        }
      >
        {tokens
          .filter((t) => t.position.zone === 'board')
          .map((token) =>
            token.position.zone === 'board' ? (
              <div
                key={token.id}
                className={`tabletop-token${drag?.tokenId === token.id ? ' dragging' : ''}`}
                style={boardCellToPercent({
                  xCell: token.position.xCell,
                  yCell: token.position.yCell,
                  grid: gridConfig,
                })}
                onPointerDown={(ev) => startDrag(ev, token)}
                role="button"
                tabIndex={0}
                aria-label={`Token ${token.entityId}`}
              >
                <span className="tabletop-token-dot" />
              </div>
            ) : null,
          )}
        {drag && drag.ghostPosition.zone === 'board' ? (
          <div
            className="tabletop-ghost"
            style={boardCellToPercent({
              xCell: drag.ghostPosition.xCell,
              yCell: drag.ghostPosition.yCell,
              grid: gridConfig,
            })}
            aria-hidden="true"
          />
        ) : null}
      </div>

      <aside ref={benchRef} className="tabletop-bench" aria-label="Off-board parking">
        {tokens
          .filter((t) => t.position.zone === 'bench')
          .map((token) =>
            token.position.zone === 'bench' ? (
              <div
                key={token.id}
                className={`tabletop-token tabletop-token--bench${drag?.tokenId === token.id ? ' dragging' : ''}`}
                style={benchSlotToPercent({
                  slot: token.position.slot,
                  benchSlots: gridConfig.benchSlots,
                })}
                onPointerDown={(ev) => startDrag(ev, token)}
                role="button"
                tabIndex={0}
                aria-label={`Bench token ${token.entityId}`}
              >
                <span className="tabletop-token-dot" />
              </div>
            ) : null,
          )}
        {drag && drag.ghostPosition.zone === 'bench' ? (
          <div
            className="tabletop-ghost tabletop-ghost--bench"
            style={benchSlotToPercent({
              slot: drag.ghostPosition.slot,
              benchSlots: gridConfig.benchSlots,
            })}
            aria-hidden="true"
          />
        ) : null}
      </aside>
    </div>
  );
}

function pointerInRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

// Surface `cellKey` so adjacent debug tools can build occupancy sets identical to the engine.
export { cellKey };
