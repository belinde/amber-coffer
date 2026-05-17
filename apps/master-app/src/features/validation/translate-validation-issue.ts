import type { ValidationIssue } from '@amber/shared';
import type { TFunction } from 'i18next';

/** Translates a validation issue slug + params for display next to a field. */
export function translateValidationIssue(t: TFunction, issue: ValidationIssue): string {
  const key = `validation.${issue.code}`;
  const translated = t(key, {
    defaultValue: '',
    ...(issue.params ?? {}),
  });
  if (translated) return translated;
  return t('validation.generic.invalid');
}

export function translateFieldErrors(
  t: TFunction,
  issues: ValidationIssue[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const pathKey = issue.path.map((segment) => String(segment)).join('.');
    out[pathKey] = translateValidationIssue(t, issue);
  }
  return out;
}
