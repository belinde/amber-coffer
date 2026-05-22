import { TABLETOP_BENCH_SLOTS, type TokenPosition } from '@amber/shared';

/** @deprecated Use `TABLETOP_BENCH_SLOTS` from `@amber/shared`. */
export const BENCH_SLOTS_DEFAULT = TABLETOP_BENCH_SLOTS;

export type Grid = {
  cols: number;
  rows: number;
  benchSlots?: number;
};

export type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

/**
 * Maps a pointer event in the board element to a board cell.
 * Origin (0,0) is the top-left cell.
 */
export function pxToBoardCell(args: {
  clientX: number;
  clientY: number;
  rect: Rect;
  grid: Pick<Grid, 'cols' | 'rows'>;
}): { xCell: number; yCell: number } {
  const { clientX, clientY, rect, grid } = args;
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;
  return {
    xCell: clampInt(Math.floor(relX * grid.cols), 0, grid.cols - 1),
    yCell: clampInt(Math.floor(relY * grid.rows), 0, grid.rows - 1),
  };
}

/**
 * Maps a pointer event inside the bench element to a bench slot index.
 * The bench is rendered as a vertical column; only the Y coordinate matters.
 */
export function pxToBenchSlot(args: { clientY: number; rect: Rect; benchSlots?: number }): {
  slot: number;
} {
  const { clientY, rect } = args;
  const slots = args.benchSlots ?? BENCH_SLOTS_DEFAULT;
  const relY = (clientY - rect.top) / rect.height;
  return {
    slot: clampInt(Math.floor(relY * slots), 0, slots - 1),
  };
}

/**
 * Returns the CSS-percentage anchor for a board cell, centred on the cell.
 * Suitable for `style={{ left: '...%', top: '...%' }}` absolute positioning.
 */
export function boardCellToPercent(args: {
  xCell: number;
  yCell: number;
  grid: Pick<Grid, 'cols' | 'rows'>;
}): { left: string; top: string } {
  const { xCell, yCell, grid } = args;
  return {
    left: `${((xCell + 0.5) / grid.cols) * 100}%`,
    top: `${((yCell + 0.5) / grid.rows) * 100}%`,
  };
}

/** 1-based CSS grid placement for a single board cell (`display: grid` on the board). */
export function boardCellToGridPlacement(args: { xCell: number; yCell: number }): {
  gridColumn: string;
  gridRow: string;
} {
  const col = args.xCell + 1;
  const row = args.yCell + 1;
  return {
    gridColumn: `${col} / ${col + 1}`,
    gridRow: `${row} / ${row + 1}`,
  };
}

export function benchSlotToPercent(args: { slot: number; benchSlots?: number }): {
  left: string;
  top: string;
} {
  const slots = args.benchSlots ?? BENCH_SLOTS_DEFAULT;
  return {
    left: '50%',
    top: `${((args.slot + 0.5) / slots) * 100}%`,
  };
}

/**
 * Deterministic key for a token position; used to compute occupancy sets.
 */
export function positionKey(position: TokenPosition): string {
  if (position.zone === 'board') {
    return `board:${position.xCell},${position.yCell}`;
  }
  return `bench:${position.slot}`;
}

/** Convenience for raw board cells. */
export function cellKey(xCell: number, yCell: number): string {
  return `board:${xCell},${yCell}`;
}

/**
 * Finds the nearest free board cell starting from `start`, expanding in Manhattan rings.
 * Mirrors the POC implementation; deterministic order (top-to-bottom, left-to-right inside each ring).
 */
export function nearestFreeBoardCell(args: {
  start: { xCell: number; yCell: number };
  grid: Pick<Grid, 'cols' | 'rows'>;
  occupied: ReadonlySet<string>;
}): { xCell: number; yCell: number } {
  const { start, grid, occupied } = args;
  const inBounds = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < grid.cols && y < grid.rows;

  if (inBounds(start.xCell, start.yCell) && !occupied.has(cellKey(start.xCell, start.yCell))) {
    return start;
  }

  const maxRadius = grid.cols + grid.rows;
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const dxAbs = radius - Math.abs(dy);
      const candidates = dxAbs === 0 ? [0] : [-dxAbs, dxAbs];
      for (const dx of candidates) {
        const x = start.xCell + dx;
        const y = start.yCell + dy;
        if (!inBounds(x, y)) continue;
        if (!occupied.has(cellKey(x, y))) return { xCell: x, yCell: y };
      }
    }
  }
  return start;
}

/**
 * Finds the nearest free bench slot, expanding symmetrically around `startSlot`.
 */
export function nearestFreeBenchSlot(args: {
  startSlot: number;
  benchSlots?: number;
  occupied: ReadonlySet<string>;
}): { slot: number } {
  const slots = args.benchSlots ?? BENCH_SLOTS_DEFAULT;
  const key = (slot: number): string => `bench:${slot}`;
  if (!args.occupied.has(key(args.startSlot))) {
    return { slot: args.startSlot };
  }
  for (let radius = 1; radius <= slots; radius++) {
    const left = args.startSlot - radius;
    const right = args.startSlot + radius;
    if (left >= 0 && !args.occupied.has(key(left))) return { slot: left };
    if (right < slots && !args.occupied.has(key(right))) return { slot: right };
  }
  return { slot: args.startSlot };
}

/** Whether client coordinates fall inside a layout rect (e.g. from `getBoundingClientRect`). */
export function pointerInRect(x: number, y: number, rect: Rect): boolean {
  return (
    x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height
  );
}
