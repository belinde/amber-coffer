import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Field } from '../../../components/ui/Field.js';
import { fieldErrorAt } from '../../validation/field-error-helpers.js';

type Props = {
  labelKey: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  fieldPath?: string;
  fieldErrors?: Readonly<Record<string, string>> | undefined;
};

export function RichTextArea({
  labelKey,
  value,
  onChange,
  rows = 6,
  fieldPath,
  fieldErrors,
}: Props): ReactElement {
  const { t } = useTranslation();
  const path = fieldPath ?? labelKey;
  const error = fieldErrorAt(fieldErrors, path);
  return (
    <Field label={t(labelKey)} htmlFor={labelKey} error={error}>
      <textarea
        id={labelKey}
        value={value}
        rows={rows}
        aria-invalid={Boolean(error)}
        onChange={(ev) => onChange(ev.target.value)}
      />
    </Field>
  );
}
