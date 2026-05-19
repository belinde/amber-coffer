import type { CampaignId, DiscordUserId, Map, SessionId, Token } from '@amber/shared';
import {
  BENCH_SLOTS_DEFAULT,
  benchSlotToPercent,
  boardCellToPercent,
  canPlayerMoveToken,
  nearestFreeBenchSlot,
  nearestFreeBoardCell,
  positionKey,
  pxToBenchSlot,
  pxToBoardCell,
} from '@amber/tabletop-engine';
import type { CSSProperties, PointerEvent, ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SyncClientLike } from '../../sync/types.js';

import { tabletopBoardAspectRatio } from './board-layout.js';
import { publishTokenMoved } from './publish-token-moved.js';
import { tabletopStore, useTabletopState } from './store.js';

type Grid = { cols: number; rows: number; benchSlots: number; gridSizePx: number };

type Props = {
  map: Map;
  campaignId: CampaignId;
  sessionId: SessionId;
  playerDiscordId: DiscordUserId;
  syncClient: SyncClientLike;
};

type DragState = {
  tokenId: Token['id'];
  pointerId: number;
  ghostPosition: Token['position'];
};

export function TabletopPlayerView({
  map,
  campaignId,
  sessionId,
  playerDiscordId,
  syncClient,
}: Props): ReactElement {
  const { t } = useTranslation();
  const state = useTabletopState();
  const tokens = state.tokens;

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
  const [gridScale, setGridScale] = useState(1);

  const boardAspectRatio = useMemo(() => tabletopBoardAspectRatio(map), [map]);

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
  } as CSSProperties;

  function resolvePosition(
    rawClientX: number,
    rawClientY: number,
    excludeTokenId: Token['id'] | null,
  ): Token['position'] {
    const boardRect = boardRef.current?.getBoundingClientRect();
    const benchRect = benchRef.current?.getBoundingClientRect();
    const occ = new Set(occupiedKeys);
    if (excludeTokenId) {
      const self = tokens.find((tok) => tok.id === excludeTokenId);
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
    if (!canPlayerMoveToken(token, playerDiscordId)) return;
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
    const token = tokens.find((tok) => tok.id === drag.tokenId);
    setDrag(null);
    if (!token) return;

    tabletopStore.dispatch({
      type: 'token.moved',
      tokenId: token.id,
      position: finalPosition,
    });
    void publishTokenMoved({
      client: syncClient,
      campaignId,
      sessionId,
      playerDiscordId,
      token,
      position: finalPosition,
    });
  }

  function tokenClassName(token: Token): string {
    const owned = canPlayerMoveToken(token, playerDiscordId);
    const dragging = drag?.tokenId === token.id;
    const base =
      token.position.zone === 'bench' ? 'tabletop-token tabletop-token--bench' : 'tabletop-token';
    const role = owned ? 'tabletop-token--owned' : 'tabletop-token--locked';
    return `${base} ${role}${dragging ? ' dragging' : ''}`;
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
            aria-label={t('tabletop.boardAria')}
            style={{ transform: `translate(-50%, -50%) scale(${gridScale})` }}
          >
            {tokens
              .filter((tok) => tok.position.zone === 'board')
              .map((token) =>
                token.position.zone === 'board' ? (
                  <div
                    key={token.id}
                    className={tokenClassName(token)}
                    style={boardCellToPercent({
                      xCell: token.position.xCell,
                      yCell: token.position.yCell,
                      grid: gridConfig,
                    })}
                    onPointerDown={(ev) => startDrag(ev, token)}
                    role={canPlayerMoveToken(token, playerDiscordId) ? 'button' : 'img'}
                    tabIndex={canPlayerMoveToken(token, playerDiscordId) ? 0 : undefined}
                    aria-label={
                      canPlayerMoveToken(token, playerDiscordId)
                        ? t('tabletop.tokenOwned', { id: token.entityId })
                        : t('tabletop.tokenLocked', { id: token.entityId })
                    }
                  >
                    <span className="tabletop-token-dot" />
                  </div>
                ) : null,
              )}
            {drag?.ghostPosition.zone === 'board' ? (
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

      <aside ref={benchRef} className="tabletop-bench" aria-label={t('tabletop.benchAria')}>
        {tokens
          .filter((tok) => tok.position.zone === 'bench')
          .map((token) =>
            token.position.zone === 'bench' ? (
              <div
                key={token.id}
                className={tokenClassName(token)}
                style={benchSlotToPercent({
                  slot: token.position.slot,
                  benchSlots: gridConfig.benchSlots,
                })}
                onPointerDown={(ev) => startDrag(ev, token)}
                role={canPlayerMoveToken(token, playerDiscordId) ? 'button' : 'img'}
                tabIndex={canPlayerMoveToken(token, playerDiscordId) ? 0 : undefined}
                aria-label={
                  canPlayerMoveToken(token, playerDiscordId)
                    ? t('tabletop.tokenOwned', { id: token.entityId })
                    : t('tabletop.tokenLocked', { id: token.entityId })
                }
              >
                <span className="tabletop-token-dot" />
              </div>
            ) : null,
          )}
        {drag?.ghostPosition.zone === 'bench' ? (
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

      {state.visibleHandouts.length > 0 ? (
        <section className="tabletop-handouts" aria-label={t('tabletop.handoutsAria')}>
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

function pointerInRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
