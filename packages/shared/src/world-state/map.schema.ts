import { z } from 'zod';

import { campaignIdSchema, mapIdSchema } from '../ids/schemas.js';

export const mapSchema = z.object({
  id: mapIdSchema,
  campaignId: campaignIdSchema,
  name: z.string().min(1),
  /** Empty until a map background image is assigned (Rust stores `''` for new maps). */
  imagePath: z.string(),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  gridSizePx: z.number().int().positive().default(50),
  gridCols: z.number().int().positive().default(24),
  gridRows: z.number().int().positive().default(18),
  benchSlots: z.number().int().positive().default(12),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type Map = z.infer<typeof mapSchema>;
