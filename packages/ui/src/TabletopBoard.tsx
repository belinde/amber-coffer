import type { Token } from '@amber/shared';
import {
  benchSlotToPercent,
  boardCellToGridPlacement,
  nearestFreeBenchSlot,
  nearestFreeBoardCell,
  pointerInRect,
  positionKey,
  pxToBenchSlot,
  pxToBoardCell,
  tokenColorStyleForToken,
} from '@amber/tabletop-engine';
import type { CSSProperties, PointerEvent, ReactElement, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  buildTabletopBoardStyles,
  tabletopGridConfigFromMap,
  type TabletopMapLayout,
} from './tabletop-board-styles.js';

export type TabletopBoardLabels = {
  boardAria: string;
  benchAria: string;
};

export type TabletopTokenInteraction = {
  className: string;
  role: 'button' | 'img';
  tabIndex?: number;
  ariaLabel: string;
  title?: string;
};

export type TabletopBoardProps = {
  map: TabletopMapLayout;
  tokens: Token[];
  tokenLabels?: Record<string, string>;
  backgroundImageUrl?: string | null;
  labels: TabletopBoardLabels;
  canDragToken: (token: Token) => boolean;
  getTokenInteraction: (token: Token, ctx: { dragging: boolean }) => TabletopTokenInteraction;
  onTokenMove?: (tokenId: Token['id'], position: Token['position']) => void | Promise<void>;
  children?: ReactNode;
};

type DragState = {
  tokenId: Token['id'];
  pointerId: number;
  ghostPosition: Token['position'];
};

export function TabletopBoard({
  map,
  tokens,
  tokenLabels = {},
  backgroundImageUrl = null,
  labels,
  canDragToken,
  getTokenInteraction,
  onTokenMove,
  children,
}: TabletopBoardProps): ReactElement {
  const gridConfig = tabletopGridConfigFromMap(map);
  const { boardStyle, gridStyle } = buildTabletopBoardStyles(map, backgroundImageUrl);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const benchRef = useRef<HTMLDivElement | null>(null);
  const boardAreaRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [snappedMaxWidth, setSnappedMaxWidth] = useState<string | undefined>(undefined);

  // Snap board width to a multiple of gridCols to avoid sub-pixel rounding artifacts
  useEffect(() => {
    const el = boardAreaRef.current;
    if (!el) return;
    const cols = gridConfig.cols;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const availableWidth = entry.contentRect.width;
        // Account for the 1px border on each side of .tabletop-board
        const innerAvailable = availableWidth - 2;
        const snapped = Math.floor(innerAvailable / cols) * cols;
        if (snapped > 0) {
          setSnappedMaxWidth(`${snapped + 2}px`);
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [gridConfig.cols]);

  const occupiedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const token of tokens) set.add(positionKey(token.position));
    return set;
  }, [tokens]);

  const interactive = Boolean(onTokenMove);

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

  function tokenStyle(token: Token): CSSProperties {
    return tokenColorStyleForToken({
      controlledByPlayerDiscordId: token.controlledByPlayerDiscordId,
    });
  }

  function tokenLabel(token: Token): string {
    return tokenLabels[token.id] ?? '?';
  }

  function startDrag(ev: PointerEvent, token: Token): void {
    if (!interactive || !onTokenMove || !canDragToken(token)) return;
    ev.preventDefault();
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
    if (!drag || !onTokenMove) return;
    if (ev.pointerId !== drag.pointerId) return;
    const finalPosition = drag.ghostPosition;
    const tokenId = drag.tokenId;
    setDrag(null);
    void Promise.resolve(onTokenMove(tokenId, finalPosition)).catch(() => undefined);
  }

  function ghostStyleForDraggedToken(): CSSProperties {
    if (!drag) return {};
    const dragged = tokens.find((t) => t.id === drag.tokenId);
    return dragged ? tokenStyle(dragged) : {};
  }

  const wrapHandlers = interactive
    ? {
        onPointerMove,
        onPointerUp: endDrag,
        onPointerCancel: endDrag,
      }
    : {};

  return (
    <div className="tabletop-wrap" {...wrapHandlers}>
      <div className="tabletop-board-area" ref={boardAreaRef}>
        <div className="tabletop-board" style={{ ...boardStyle, maxWidth: snappedMaxWidth }}>
          <div
            ref={boardRef}
            className="tabletop-board__grid"
            style={gridStyle}
            role="application"
            aria-label={labels.boardAria}
          >
            {tokens
              .filter((tok) => tok.position.zone === 'board')
              .map((token) =>
                token.position.zone === 'board' ? (
                  <TokenCell
                    key={token.id}
                    interaction={getTokenInteraction(token, {
                      dragging: drag?.tokenId === token.id,
                    })}
                    placementStyle={boardCellToGridPlacement({
                      xCell: token.position.xCell,
                      yCell: token.position.yCell,
                    })}
                    colorStyle={tokenStyle(token)}
                    label={tokenLabel(token)}
                    {...(interactive
                      ? { onPointerDown: (ev: PointerEvent) => startDrag(ev, token) }
                      : {})}
                  />
                ) : null,
              )}
            {drag?.ghostPosition.zone === 'board' ? (
              <div
                className="tabletop-ghost"
                style={{
                  ...boardCellToGridPlacement({
                    xCell: drag.ghostPosition.xCell,
                    yCell: drag.ghostPosition.yCell,
                  }),
                  ...ghostStyleForDraggedToken(),
                }}
                aria-hidden="true"
              />
            ) : null}
          </div>
        </div>
      </div>

      <aside ref={benchRef} className="tabletop-bench" aria-label={labels.benchAria}>
        {tokens
          .filter((tok) => tok.position.zone === 'bench')
          .map((token) =>
            token.position.zone === 'bench' ? (
              <TokenCell
                key={token.id}
                interaction={getTokenInteraction(token, { dragging: drag?.tokenId === token.id })}
                placementStyle={benchSlotToPercent({
                  slot: token.position.slot,
                  benchSlots: gridConfig.benchSlots,
                })}
                colorStyle={tokenStyle(token)}
                label={tokenLabel(token)}
                {...(interactive
                  ? { onPointerDown: (ev: PointerEvent) => startDrag(ev, token) }
                  : {})}
              />
            ) : null,
          )}
        {drag?.ghostPosition.zone === 'bench' ? (
          <div
            className="tabletop-ghost tabletop-ghost--bench"
            style={{
              ...benchSlotToPercent({
                slot: drag.ghostPosition.slot,
                benchSlots: gridConfig.benchSlots,
              }),
              ...ghostStyleForDraggedToken(),
            }}
            aria-hidden="true"
          />
        ) : null}
      </aside>

      {children}
    </div>
  );
}

function TokenCell({
  interaction,
  placementStyle,
  colorStyle,
  label,
  onPointerDown,
}: {
  interaction: TabletopTokenInteraction;
  placementStyle: CSSProperties;
  colorStyle: CSSProperties;
  label: string;
  onPointerDown?: (ev: PointerEvent) => void;
}): ReactElement {
  return (
    <div
      className={interaction.className}
      style={{ ...placementStyle, ...colorStyle }}
      onPointerDown={onPointerDown}
      role={interaction.role}
      tabIndex={interaction.tabIndex}
      aria-label={interaction.ariaLabel}
      title={interaction.title ?? interaction.ariaLabel}
    >
      <span className="tabletop-token-label">{label}</span>
    </div>
  );
}
