import { z } from 'zod';

import { canonDiffIdSchema, entityKindSchema, sessionIdSchema } from '../ids/schemas.js';

export const canonDiffStatusSchema = z.enum(['pending', 'approved', 'rejected']);

export const canonDiffSchema = z.object({
  id: canonDiffIdSchema,
  sessionId: sessionIdSchema,
  entityKind: entityKindSchema,
  entityId: z.string().min(1),
  fieldPath: z.string().min(1),
  oldValue: z.unknown().nullable(),
  newValue: z.unknown(),
  rationale: z.string().nullable(),
  status: canonDiffStatusSchema.default('pending'),
  reviewedAt: z.number().int().nonnegative().nullable(),
  reviewedBy: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type CanonDiff = z.infer<typeof canonDiffSchema>;
