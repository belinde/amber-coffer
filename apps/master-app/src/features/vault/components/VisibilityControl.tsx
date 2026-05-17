import type { Visibility } from '@amber/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Field } from '../../../components/ui/Field.js';
import { fieldErrorAt } from '../../validation/field-error-helpers.js';

const OPTIONS: Visibility[] = ['gm_only', 'shared', 'public_canon'];

type Props = {
  value: Visibility;
  onChange: (value: Visibility) => void;
  fieldErrors?: Readonly<Record<string, string>> | undefined;
};

export function VisibilityControl({ value, onChange, fieldErrors }: Props): ReactElement {
  const { t } = useTranslation();
  return (
    <Field
      label={t('vault.fields.visibility')}
      htmlFor="visibility"
      error={fieldErrorAt(fieldErrors, 'visibility')}
    >
      <select
        id="visibility"
        value={value}
        onChange={(ev) => onChange(ev.target.value as Visibility)}
      >
        {OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {t(`vault.visibility.${opt}`)}
          </option>
        ))}
      </select>
      <p className="vault-section-help">{t(`vault.visibilityHint.${value}`)}</p>
    </Field>
  );
}
