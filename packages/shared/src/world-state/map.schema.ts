import { z } from 'zod';

import { campaignIdSchema, mapIdSchema } from '../ids/schemas.js';
import {
  TABLETOP_BENCH_SLOTS,
  TABLETOP_GRID_COLS,
  TABLETOP_GRID_ROWS,
  TABLETOP_GRID_SIZE_PX,
  TABLETOP_VIEWPORT_HEIGHT_PX,
  TABLETOP_VIEWPORT_WIDTH_PX,
} from '../tabletop/defaults.js';

export const mapSchema = z.object({
  id: mapIdSchema,
  campaignId: campaignIdSchema,
  name: z.string().min(1),
  /** Empty until a map background image is assigned (Rust stores `''` for new maps). */
  imagePath: z.string(),
  /**
   * Relative public path on the table origin (e.g. `/session-assets/...webp`).
   * Populated when the GM publishes the map background for the active session.
   */
  backgroundPublicPath: z.string().optional(),
  widthPx: z.number().int().positive().default(TABLETOP_VIEWPORT_WIDTH_PX),
  heightPx: z.number().int().positive().default(TABLETOP_VIEWPORT_HEIGHT_PX),
  gridSizePx: z.number().int().positive().default(TABLETOP_GRID_SIZE_PX),
  gridCols: z.number().int().positive().default(TABLETOP_GRID_COLS),
  gridRows: z.number().int().positive().default(TABLETOP_GRID_ROWS),
  benchSlots: z.number().int().positive().default(TABLETOP_BENCH_SLOTS),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type Map = z.infer<typeof mapSchema>;
