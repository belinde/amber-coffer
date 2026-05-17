import { z } from 'zod';

export const locationSectionSchema = z.object({
  title: z.string().min(1),
  body: z.string().default(''),
});

export const locationSectionsSchema = z.array(locationSectionSchema).default([]);

export type LocationSection = z.infer<typeof locationSectionSchema>;
