import { z } from 'zod';

/** Rust/SQLite emit `null` for unset Option fields; accept nullish at the boundary. */
export const imageRefSchema = z.object({
  local: z.string().nullish(),
  hash: z.string().nullish(),
  thumbnailUrl: z.string().nullish(),
  canonUrl: z.string().nullish(),
  tokenPortraitUrl: z.string().nullish(),
});

export type ImageRef = z.infer<typeof imageRefSchema>;
