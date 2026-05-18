import { FieldValidationError, validationIssueSchema, type ValidationIssue } from '@amber/shared';
import { z } from 'zod';

const invokeValidationPayloadSchema = z.object({
  kind: z.literal('validation'),
  issues: z.array(validationIssueSchema),
});

const invokeMessagePayloadSchema = z.object({
  kind: z.string(),
  message: z.string().optional(),
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

/** User-facing text for Tauri invoke failures (plain objects, not always `Error`). */
export function formatInvokeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }

  if (typeof err === 'string') {
    const json = tryParseJsonString(err);
    if (json && typeof json === 'object' && json !== null && 'message' in json) {
      const parsed = invokeMessagePayloadSchema.safeParse(json);
      if (parsed.success && parsed.data.message) {
        return parsed.data.message;
      }
    }
    return err;
  }

  if (typeof err === 'object' && err !== null) {
    const validation = parseInvokeError(err);
    if (validation) {
      return 'Validation failed';
    }

    const parsed = invokeMessagePayloadSchema.safeParse(err);
    if (parsed.success && parsed.data.message) {
      return parsed.data.message;
    }

    if ('message' in err && typeof err.message === 'string') {
      return (err as { message: string }).message;
    }
  }

  return String(err);
}
