import { FieldValidationError } from '@amber/shared';
import type { TFunction } from 'i18next';

import { parseInvokeError } from '../../bridge/parse-invoke-error.js';
import type { SectionId } from '../vault/entity-sections.config.js';
import type { VaultCategory } from '../vault/vault-categories.js';

import { firstSectionWithFieldErrors } from './section-for-field-path.js';
import { translateFieldErrors } from './translate-validation-issue.js';

export function resolveValidationError(err: unknown): FieldValidationError | null {
  if (err instanceof FieldValidationError) {
    return err;
  }
  return parseInvokeError(err);
}

/** Returns true when validation issues were applied to form state. */
export function applyValidationFailure(
  err: unknown,
  t: TFunction,
  category: VaultCategory | null,
  setFieldErrors: (errors: Record<string, string>) => void,
  setActiveSection?: (sectionId: SectionId) => void,
): boolean {
  const validation = resolveValidationError(err);
  if (!validation) return false;

  const messages = translateFieldErrors(t, validation.issues);
  setFieldErrors(messages);

  if (category && setActiveSection) {
    const keys = Object.keys(messages);
    const first = firstSectionWithFieldErrors(category, keys);
    if (first) setActiveSection(first);
  }

  return true;
}
