import { z } from 'zod';

export const visualReferenceSchema = z.object({
  prompt: z.string().default(''),
});

export const appearanceSchema = z.object({
  description: z.string().default(''),
  personality: z.string().default(''),
  permanentMarks: z.array(z.string()).default([]),
  visualReference: visualReferenceSchema.default({ prompt: '' }),
});

export type Appearance = z.infer<typeof appearanceSchema>;
export type VisualReference = z.infer<typeof visualReferenceSchema>;

export const defaultAppearance: Appearance = {
  description: '',
  personality: '',
  permanentMarks: [],
  visualReference: { prompt: '' },
};
