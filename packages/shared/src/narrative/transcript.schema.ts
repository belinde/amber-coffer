import { z } from 'zod';

import { recordingIdSchema, sessionIdSchema, transcriptIdSchema } from '../ids/schemas.js';

export const transcriptSchema = z.object({
  id: transcriptIdSchema,
  sessionId: sessionIdSchema,
  sourceRecordingId: recordingIdSchema.nullable(),
  rawText: z.string().nullable(),
  /** Relative path under campaign root, e.g. sessions/3/transcripts/raw-merged.txt */
  rawTranscriptPath: z.string().nullable(),
  refinedText: z.string().nullable(),
  sttModel: z.string().nullable(),
  llmModel: z.string().nullable(),
  processedAt: z.number().int().nonnegative().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type Transcript = z.infer<typeof transcriptSchema>;
