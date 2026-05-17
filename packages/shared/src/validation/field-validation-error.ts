import type { ValidationIssue } from './validation-issue.js';
import { pathToFieldKey } from './validation-issue.js';

export class FieldValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super('validation_failed');
    this.name = 'FieldValidationError';
    this.issues = issues;
  }

  fieldErrors(): Record<string, ValidationIssue> {
    const map: Record<string, ValidationIssue> = {};
    for (const issue of this.issues) {
      map[pathToFieldKey(issue.path)] = issue;
    }
    return map;
  }
}
