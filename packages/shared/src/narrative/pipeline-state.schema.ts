import { z } from 'zod';

export const pipelineStatusSchema = z.enum(['starting', 'ready', 'active', 'draining', 'stopped']);

export type PipelineStatus = z.infer<typeof pipelineStatusSchema>;

export const pipelineStateSchema = z.object({
  status: pipelineStatusSchema,
  chunksTranscribed: z.number().int().nonnegative(),
  chunksPending: z.number().int().nonnegative(),
  lastUpdatedAt: z.number().int().nonnegative(),
  errors: z.array(
    z.object({
      chunkPath: z.string(),
      error: z.string(),
      timestamp: z.number().int().nonnegative(),
    }),
  ),
});

export type PipelineState = z.infer<typeof pipelineStateSchema>;

export const pipelineSignalSchema = z.object({
  action: z.enum(['stop']),
  writtenAt: z.number().int().nonnegative(),
});

export type PipelineSignal = z.infer<typeof pipelineSignalSchema>;
