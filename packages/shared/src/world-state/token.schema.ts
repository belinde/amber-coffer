import { z } from 'zod';

import {
  mapIdSchema,
  nullableDiscordUserIdSchema,
  sessionIdSchema,
  tokenEntityKindSchema,
  tokenIdSchema,
} from '../ids/schemas.js';

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

export const tokenSchema = z
  .object({
    id: tokenIdSchema,
    mapId: mapIdSchema,
    entityKind: tokenEntityKindSchema,
    entityId: z.string().min(1),
    /** Set for session-only custom tokens; omitted for vault-linked tokens. */
    sessionId: sessionIdSchema.nullable().optional().default(null),
    /** Display name for custom session tokens (not resolved from vault entities). */
    displayName: z.string().min(1).max(120).nullable().optional().default(null),
    position: tokenPositionSchema,
    visibleToPlayers: z.boolean().default(true),
    /** Discord user allowed to drag this token in the Player Activity (PG or delegated summon). */
    controlledByPlayerDiscordId: nullableDiscordUserIdSchema.default(null),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    version: z.number().int().positive().default(1),
  })
  .superRefine((token, ctx) => {
    if (token.entityKind === 'custom') {
      if (!token.sessionId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'sessionId is required for custom tokens',
          path: ['sessionId'],
        });
      }
      if (!token.displayName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'displayName is required for custom tokens',
          path: ['displayName'],
        });
      }
    }
  });

export type Token = z.infer<typeof tokenSchema>;
