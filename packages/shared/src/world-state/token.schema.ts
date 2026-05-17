import { z } from 'zod';

import { mapIdSchema, tokenEntityKindSchema, tokenIdSchema } from '../ids/schemas.js';

/**
 * Token position uses cell coordinates with two zones:
 * - `board`: indexed by `xCell` (column, 0..gridCols-1) and `yCell` (row, 0..gridRows-1)
 * - `bench`: linear off-board parking with `slot` index (0..benchSlots-1)
 *
 * Decision recorded in docs/migration/tabletop-porting-notes.md (D1, D2).
 */
const boardPositionSchema = z.object({
  zone: z.literal('board'),
  xCell: z.number().int().nonnegative(),
  yCell: z.number().int().nonnegative(),
});

const benchPositionSchema = z.object({
  zone: z.literal('bench'),
  slot: z.number().int().nonnegative(),
});

export const tokenPositionSchema = z.discriminatedUnion('zone', [
  boardPositionSchema,
  benchPositionSchema,
]);

export type TokenPosition = z.infer<typeof tokenPositionSchema>;
export type BoardTokenPosition = z.infer<typeof boardPositionSchema>;
export type BenchTokenPosition = z.infer<typeof benchPositionSchema>;

export const tokenSchema = z.object({
  id: tokenIdSchema,
  mapId: mapIdSchema,
  entityKind: tokenEntityKindSchema,
  entityId: z.string().min(1),
  position: tokenPositionSchema,
  visibleToPlayers: z.boolean().default(true),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type Token = z.infer<typeof tokenSchema>;
