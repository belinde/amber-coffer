import { z } from 'zod';

/** A single entry from the Image Manifest API representing an S3 object. */
export const manifestEntrySchema = z.object({
  key: z.string().min(1),
  etag: z.string().min(1),
});

export type ManifestEntry = z.infer<typeof manifestEntrySchema>;
