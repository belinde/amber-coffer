import { z } from 'zod';

import { campaignIdSchema, campaignImageIdSchema } from '../ids/schemas.js';

import { imageLinkSchema } from './image-link.schema.js';
import { imageRefSchema } from './image-ref.schema.js';
import { defaultVisibility, visibilitySchema } from './visibility.schema.js';

export const campaignImageSchema = z.object({
  id: campaignImageIdSchema,
  campaignId: campaignIdSchema,
  title: z.string().min(1),
  caption: z.string().default(''),
  image: imageRefSchema.nullable().default(null),
  links: z.array(imageLinkSchema).default([]),
  visibility: visibilitySchema.default(defaultVisibility),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type CampaignImage = z.infer<typeof campaignImageSchema>;
