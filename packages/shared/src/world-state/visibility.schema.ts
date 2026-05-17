import { z } from 'zod';

export const visibilitySchema = z.enum(['gm_only', 'shared', 'public_canon']);

export type Visibility = z.infer<typeof visibilitySchema>;

export const defaultVisibility: Visibility = 'gm_only';
