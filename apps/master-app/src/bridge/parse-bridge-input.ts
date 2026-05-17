import { FieldValidationError, fieldValidationErrorFromZod } from '@amber/shared';
import type { ZodType } from 'zod';

export function parseBridgeInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw fieldValidationErrorFromZod(result.error);
  }
  return result.data;
}

export { FieldValidationError };
