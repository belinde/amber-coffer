import type { LocationSection } from '@amber/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../components/ui/Button.js';
import { Field } from '../../../components/ui/Field.js';
import { ActionIcons } from '../../../components/ui/icons.js';
import { fieldErrorAt } from '../../validation/field-error-helpers.js';

type Props = {
  value: LocationSection[];
  onChange: (value: LocationSection[]) => void;
  fieldErrors?: Readonly<Record<string, string>> | undefined;
};

export function LocationSectionsEditor({ value, onChange, fieldErrors }: Props): ReactElement {
  const { t } = useTranslation();

  function updateAt(index: number, patch: Partial<LocationSection>): void {
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addSection(): void {
    onChange([...value, { title: t('vault.newSectionTitle'), body: '' }]);
  }

  function removeAt(index: number): void {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="vault-list-editor">
      {value.map((section, index) => (
        <div key={index} className="vault-list-item">
          <Field
            label={t('vault.fields.sectionTitle')}
            error={fieldErrorAt(fieldErrors, `sections.${index}.title`)}
          >
            <input
              type="text"
              value={section.title}
              onChange={(ev) => updateAt(index, { title: ev.target.value })}
            />
          </Field>
          <Field
            label={t('vault.fields.sectionBody')}
            error={fieldErrorAt(fieldErrors, `sections.${index}.body`)}
          >
            <textarea
              rows={4}
              value={section.body}
              onChange={(ev) => updateAt(index, { body: ev.target.value })}
            />
          </Field>
          <Button type="button" variant="danger" icon={ActionIcons.delete} onClick={() => removeAt(index)}>
            {t('common.delete')}
          </Button>
        </div>
      ))}
      <Button type="button" icon={ActionIcons.add} onClick={addSection}>
        {t('vault.addSection')}
      </Button>
    </div>
  );
}
