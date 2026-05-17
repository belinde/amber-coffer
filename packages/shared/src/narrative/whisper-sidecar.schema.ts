import { z } from 'zod';

export const whisperSegmentSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  text: z.string(),
  speaker: z.string().min(1),
  sourceId: z.string().min(1).optional(),
});

export type WhisperSegment = z.infer<typeof whisperSegmentSchema>;

export const whisperTranscribeResultSchema = z.object({
  model: z.string().min(1),
  language: z.string().min(1),
  segments: z.array(whisperSegmentSchema),
  mergedTextPath: z.string().min(1),
});

export type WhisperTranscribeResult = z.infer<typeof whisperTranscribeResultSchema>;

export const whisperTranscribeRequestSchema = z.object({
  sessionDir: z.string().min(1),
  language: z.string().min(1).default('it'),
  model: z.string().min(1).default('base'),
});

export type WhisperTranscribeRequest = z.infer<typeof whisperTranscribeRequestSchema>;
