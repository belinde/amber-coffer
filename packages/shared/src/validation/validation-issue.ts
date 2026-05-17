import { z } from 'zod';

/** Machine-readable validation issue (i18n slug + params). */
export const validationIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  code: z.string().min(1),
  params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export function pathToFieldKey(path: ValidationIssue['path']): string {
  return path.map((segment) => String(segment)).join('.');
}
