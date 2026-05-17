import {
  FieldValidationError,
  validationIssueSchema,
  type ValidationIssue,
} from '@amber/shared';
import { z } from 'zod';

const invokeValidationPayloadSchema = z.object({
  kind: z.literal('validation'),
  issues: z.array(validationIssueSchema),
});

function issuesFromUnknown(raw: unknown): ValidationIssue[] | null {
  const parsed = invokeValidationPayloadSchema.safeParse(raw);
  return parsed.success ? parsed.data.issues : null;
}

function tryParseJsonString(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

/** Extracts structured validation issues from a Tauri invoke failure. */
export function parseInvokeError(err: unknown): FieldValidationError | null {
  if (err instanceof FieldValidationError) {
    return err;
  }

  if (typeof err === 'object' && err !== null) {
    const issues = issuesFromUnknown(err);
    if (issues) return new FieldValidationError(issues);
  }

  if (typeof err === 'string') {
    const json = tryParseJsonString(err);
    if (json) {
      const issues = issuesFromUnknown(json);
      if (issues) return new FieldValidationError(issues);
    }
  }

  if (err instanceof Error) {
    const json = tryParseJsonString(err.message);
    if (json) {
      const issues = issuesFromUnknown(json);
      if (issues) return new FieldValidationError(issues);
    }
  }

  return null;
}
