import type { ZodError, ZodIssue } from 'zod';

import type { ValidationIssue } from './validation-issue.js';
import { FieldValidationError } from './field-validation-error.js';

function num(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

function zodIssueToValidationIssue(issue: ZodIssue): ValidationIssue {
  const path = issue.path.filter((segment) => segment !== '');

  switch (issue.code) {
    case 'too_small':
      if (issue.type === 'string') {
        return {
          path,
          code: 'string.min_length',
          params: { min: num(issue.minimum) },
        };
      }
      if (issue.type === 'array') {
        return {
          path,
          code: 'array.min_length',
          params: { min: num(issue.minimum) },
        };
      }
      if (issue.type === 'number') {
        return {
          path,
          code: 'number.min',
          params: { min: num(issue.minimum) },
        };
      }
      break;
    case 'too_big':
      if (issue.type === 'string') {
        return {
          path,
          code: 'string.max_length',
          params: { max: num(issue.maximum) },
        };
      }
      if (issue.type === 'array') {
        return {
          path,
          code: 'array.max_length',
          params: { max: num(issue.maximum) },
        };
      }
      if (issue.type === 'number') {
        return {
          path,
          code: 'number.max',
          params: { max: num(issue.maximum) },
        };
      }
      break;
    case 'invalid_type':
      return { path, code: 'type.invalid', params: { expected: String(issue.expected) } };
    case 'invalid_enum_value':
      return { path, code: 'enum.invalid' };
    case 'invalid_string':
      if (issue.validation === 'uuid') {
        return { path, code: 'string.uuid' };
      }
      break;
    default:
      break;
  }

  return { path, code: 'generic.invalid' };
}

export function validationIssuesFromZod(error: ZodError): ValidationIssue[] {
  return error.issues.map(zodIssueToValidationIssue);
}

export function fieldValidationErrorFromZod(error: ZodError): FieldValidationError {
  return new FieldValidationError(validationIssuesFromZod(error));
}
