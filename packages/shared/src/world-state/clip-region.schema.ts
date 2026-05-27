import { z } from 'zod';

export const clipRegionSchema = z
  .object({
    centerX: z.number().min(0).max(1),
    centerY: z.number().min(0).max(1),
    halfSide: z.number().min(0.05).max(0.5),
  })
  .refine(
    (c) =>
      c.centerX - c.halfSide >= 0 &&
      c.centerX + c.halfSide <= 1 &&
      c.centerY - c.halfSide >= 0 &&
      c.centerY + c.halfSide <= 1,
    { message: 'Clip region must fit within image bounds' },
  );

export type ClipRegion = z.infer<typeof clipRegionSchema>;
