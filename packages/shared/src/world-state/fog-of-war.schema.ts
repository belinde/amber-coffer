import { z } from 'zod';

import { fogRegionIdSchema, mapIdSchema } from '../ids/schemas.js';

export const fogPointSchema = z.tuple([z.number(), z.number()]);

export const fogRegionSchema = z.object({
  points: z.array(fogPointSchema).min(3),
});

export const fogOfWarSchema = z.object({
  id: fogRegionIdSchema,
  mapId: mapIdSchema,
  region: fogRegionSchema,
  revealed: z.boolean().default(false),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type FogOfWar = z.infer<typeof fogOfWarSchema>;
export type FogRegion = z.infer<typeof fogRegionSchema>;
