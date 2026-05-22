import { z } from 'zod';

import { campaignIdSchema, sessionIdSchema } from '../ids/schemas.js';

/** Session tactical asset uploaded to S3 under the player-activity bucket prefix. */
export const sessionAssetKindSchema = z.enum(['handout', 'map-background']);

export type SessionAssetKind = z.infer<typeof sessionAssetKindSchema>;

export const sessionAssetPresignRequestSchema = z.object({
  campaignId: campaignIdSchema,
  sessionId: sessionIdSchema,
  assetKind: sessionAssetKindSchema,
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  contentLength: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024)
    .optional(),
});

export type SessionAssetPresignRequest = z.infer<typeof sessionAssetPresignRequestSchema>;

/** Relative path served from the table CloudFront origin (Discord `/` mapping). */
export const sessionAssetPresignResponseSchema = z.object({
  uploadUrl: z.string().url(),
  publicPath: z.string().regex(/^\/session-assets\/.+\.webp$/),
  objectKey: z.string().min(1),
  expiresAt: z.number().int().nonnegative(),
});

export type SessionAssetPresignResponse = z.infer<typeof sessionAssetPresignResponseSchema>;

/** Prefix for public session assets on the table origin. */
export const SESSION_ASSETS_PUBLIC_PREFIX = '/session-assets';
