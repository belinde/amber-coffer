import { z } from 'zod';

import { sessionIdSchema } from '../ids/schemas.js';

export const eventReferenceSchema = z.object({
  sessionId: sessionIdSchema,
  summary: z.string().min(1),
  occurredAt: z.number().int().nonnegative(),
});

export type EventReference = z.infer<typeof eventReferenceSchema>;
