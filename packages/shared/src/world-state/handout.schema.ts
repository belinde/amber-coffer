import { z } from 'zod';

import { campaignIdSchema, handoutIdSchema, sessionIdSchema } from '../ids/schemas.js';

/**
 * Handout: a document / image the Master shares with players during a session
 * (visual reference, hand-drawn map, NPC portrait, riddle text, ...).
 *
 * Decision recorded in docs/migration/tabletop-porting-notes.md (D4): first-class entity
 * with persistent history per session, sync via dedicated MQTT messages.
 *
 * `image.localPath` is the Master-side L1 reference; `image.thumbnailUrl` / `image.canonUrl`
 * are S3/CloudFront URLs populated when the Master publishes the asset (see ADR 0006).
 */
const handoutImageRefSchema = z.object({
  localPath: z.string().min(1).optional(),
  thumbnailUrl: z.string().min(1).optional(),
  canonUrl: z.string().min(1).optional(),
  hash: z.string().min(1).optional(),
});

export type HandoutImageRef = z.infer<typeof handoutImageRefSchema>;

export const handoutSchema = z.object({
  id: handoutIdSchema,
  campaignId: campaignIdSchema,
  sessionId: sessionIdSchema,
  label: z.string().min(1),
  body: z.string().optional(),
  image: handoutImageRefSchema.optional(),
  visibleToPlayers: z.boolean().default(false),
  shownAt: z.number().int().nonnegative().nullable().default(null),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type Handout = z.infer<typeof handoutSchema>;
