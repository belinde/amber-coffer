import { z } from 'zod';

export const publicCanonCharacterSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  meta: z.string().optional(),
  excerpt: z.string().optional(),
});

export const publicCanonSessionSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  badge: z.string().optional(),
  meta: z.string().optional(),
  excerpt: z.string().optional(),
});

export const publicCanonPayloadSchema = z.object({
  campaignTitle: z.string().min(1),
  tagline: z.string().optional(),
  characters: z.array(publicCanonCharacterSchema).default([]),
  sessions: z.array(publicCanonSessionSchema).default([]),
});

export type PublicCanonPayload = z.infer<typeof publicCanonPayloadSchema>;
