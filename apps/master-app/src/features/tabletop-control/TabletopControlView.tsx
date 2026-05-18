import type { Campaign, Map, Token } from '@amber/shared';
import {
  BENCH_SLOTS_DEFAULT,
  benchSlotToPercent,
  boardCellToPercent,
  nearestFreeBenchSlot,
  nearestFreeBoardCell,
  positionKey,
  pxToBenchSlot,
  pxToBoardCell,
} from '@amber/tabletop-engine';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { CSSProperties, PointerEvent, ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { resolveCampaignImagePath } from '../../bridge/campaign-images.js';

import { moveToken } from './bridge.js';
import { tabletopBoardAspectRatio } from './tabletop-board-layout.js';

type Grid = { cols: number; rows: number; benchSlots: number; gridSizePx: number };
type RuntimeTokenId = Token['id'];
type RuntimeTokenPosition = Token['position'];

type Props = {
  campaignId: Campaign['id'];
  map: Pick<
    Map,
    'imagePath' | 'widthPx' | 'heightPx' | 'gridCols' | 'gridRows' | 'gridSizePx' | 'benchSlots'
  >;
  tokens: Token[];
  canEdit?: boolean;
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
 */
export function TabletopControlView({
  campaignId,
  map,
  tokens,
  canEdit = true,
  onAfterMove,
}: Props): ReactElement {
  const gridConfig: Grid = {
    cols: map.gridCols,
    rows: map.gridRows,
    benchSlots: map.benchSlots ?? BENCH_SLOTS_DEFAULT,
    gridSizePx: map.gridSizePx,
  };

  const boardShellRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const benchRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [gridScale, setGridScale] = useState(1);

  const boardAspectRatio = useMemo(() => tabletopBoardAspectRatio(map), [map]);

  const loadBackground = useCallback(async () => {
    const local = map.imagePath.trim();
    if (!local) {
      setBackgroundUrl(null);
      return;
    }
    try {
      const absolute = await resolveCampaignImagePath(campaignId, local);
      setBackgroundUrl(convertFileSrc(absolute));
    } catch {
      setBackgroundUrl(null);
    }
  }, [campaignId, map.imagePath]);

  useEffect(() => {
    void loadBackground();
  }, [loadBackground]);

  useEffect(() => {
    const shell = boardShellRef.current;
    if (!shell) return;

    const updateScale = (): void => {
      const boardWidth = shell.clientWidth;
      const boardHeight = shell.clientHeight;
      const gridWidth = gridConfig.cols * gridConfig.gridSizePx;
      const gridHeight = gridConfig.rows * gridConfig.gridSizePx;
      if (boardWidth <= 0 || boardHeight <= 0 || gridWidth <= 0 || gridHeight <= 0) {
        setGridScale(1);
        return;
      }
      setGridScale(Math.min(boardWidth / gridWidth, boardHeight / gridHeight));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [gridConfig.cols, gridConfig.gridSizePx, gridConfig.rows]);

  const occupiedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const token of tokens) set.add(positionKey(token.position));
    return set;
  }, [tokens]);

  const boardStyle = {
    '--board-aspect-ratio': boardAspectRatio,
    '--cell-size': `${gridConfig.gridSizePx}px`,
    '--grid-cols': gridConfig.cols,
    '--grid-rows': gridConfig.rows,
    ...(backgroundUrl ? { '--board-bg-image': `url("${backgroundUrl}")` } : {}),
  } as CSSProperties;

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
    <div
      className="tabletop-wrap"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="tabletop-board-area">
        <div ref={boardShellRef} className="tabletop-board" style={boardStyle}>
          <div
            ref={boardRef}
            className="tabletop-board__grid"
            role="application"
            aria-label="Tabletop control"
            style={{ transform: `translate(-50%, -50%) scale(${gridScale})` }}
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
        </div>
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
