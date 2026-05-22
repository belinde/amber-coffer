import { describe, expect, it } from 'vitest';

import {
  BENCH_SLOTS_DEFAULT,
  benchSlotToPercent,
  boardCellToGridPlacement,
  boardCellToPercent,
  cellKey,
  nearestFreeBenchSlot,
  nearestFreeBoardCell,
  positionKey,
  pxToBenchSlot,
  pxToBoardCell,
} from './geometry.js';

const grid = { cols: 24, rows: 18 } as const;
const boardRect = { left: 0, top: 0, width: 240, height: 180 };

describe('pxToBoardCell', () => {
  it('maps top-left pointer to (0,0)', () => {
    expect(pxToBoardCell({ clientX: 0, clientY: 0, rect: boardRect, grid })).toEqual({
      xCell: 0,
      yCell: 0,
    });
  });

  it('maps centre pointer near grid centre', () => {
    expect(pxToBoardCell({ clientX: 120, clientY: 90, rect: boardRect, grid })).toEqual({
      xCell: 12,
      yCell: 9,
    });
  });

  it('clamps pointers outside the rect into the grid range', () => {
    expect(pxToBoardCell({ clientX: -5, clientY: -5, rect: boardRect, grid })).toEqual({
      xCell: 0,
      yCell: 0,
    });
    expect(pxToBoardCell({ clientX: 9999, clientY: 9999, rect: boardRect, grid })).toEqual({
      xCell: 23,
      yCell: 17,
    });
  });
});

describe('pxToBenchSlot', () => {
  it('uses the default bench slot count when not provided', () => {
    const rect = { left: 0, top: 0, width: 40, height: 120 };
    expect(pxToBenchSlot({ clientY: 0, rect })).toEqual({ slot: 0 });
    expect(pxToBenchSlot({ clientY: 60, rect })).toEqual({
      slot: Math.floor((60 / 120) * BENCH_SLOTS_DEFAULT),
    });
  });
});

describe('boardCellToGridPlacement', () => {
  it('uses explicit single-cell grid areas (1-based)', () => {
    expect(boardCellToGridPlacement({ xCell: 0, yCell: 0 })).toEqual({
      gridColumn: '1 / 2',
      gridRow: '1 / 2',
    });
    expect(boardCellToGridPlacement({ xCell: 5, yCell: 7 })).toEqual({
      gridColumn: '6 / 7',
      gridRow: '8 / 9',
    });
  });
});

describe('boardCellToPercent / benchSlotToPercent', () => {
  it('centres the percentage anchor within the cell', () => {
    expect(boardCellToPercent({ xCell: 0, yCell: 0, grid })).toEqual({
      left: `${(0.5 / 24) * 100}%`,
      top: `${(0.5 / 18) * 100}%`,
    });
  });

  it('places bench tokens on the middle vertical axis', () => {
    expect(benchSlotToPercent({ slot: 0 })).toEqual({
      left: '50%',
      top: `${(0.5 / BENCH_SLOTS_DEFAULT) * 100}%`,
    });
  });
});

describe('positionKey', () => {
  it('encodes board cells with their coordinates', () => {
    expect(positionKey({ zone: 'board', xCell: 3, yCell: 4 })).toBe('board:3,4');
  });

  it('encodes bench slots distinctly from board cells with the same numeric value', () => {
    expect(positionKey({ zone: 'bench', slot: 3 })).toBe('bench:3');
  });
});

describe('nearestFreeBoardCell', () => {
  it('returns the start cell when free', () => {
    const occupied = new Set<string>();
    expect(nearestFreeBoardCell({ start: { xCell: 5, yCell: 5 }, grid, occupied })).toEqual({
      xCell: 5,
      yCell: 5,
    });
  });

  it('finds a neighbour deterministically when start is occupied', () => {
    const occupied = new Set([cellKey(5, 5)]);
    const result = nearestFreeBoardCell({ start: { xCell: 5, yCell: 5 }, grid, occupied });
    expect(result).not.toEqual({ xCell: 5, yCell: 5 });
    expect(Math.abs(result.xCell - 5) + Math.abs(result.yCell - 5)).toBe(1);
  });

  it('respects grid bounds', () => {
    const occupied = new Set([cellKey(0, 0)]);
    const result = nearestFreeBoardCell({ start: { xCell: 0, yCell: 0 }, grid, occupied });
    expect(result.xCell).toBeGreaterThanOrEqual(0);
    expect(result.yCell).toBeGreaterThanOrEqual(0);
  });
});

describe('nearestFreeBenchSlot', () => {
  it('returns start slot when free', () => {
    expect(nearestFreeBenchSlot({ startSlot: 4, occupied: new Set() })).toEqual({ slot: 4 });
  });

  it('expands symmetrically when the start slot is taken', () => {
    const occupied = new Set(['bench:4']);
    const result = nearestFreeBenchSlot({ startSlot: 4, occupied });
    expect(result.slot).not.toBe(4);
    expect(Math.abs(result.slot - 4)).toBeLessThanOrEqual(1);
  });
});
