import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { RichTextArea } from './RichTextArea.js';

type Props = {
  value: string;
  onChange: (value: string) => void;
  fieldErrors?: Readonly<Record<string, string>> | undefined;
};

export function VisualPromptEditor({ value, onChange, fieldErrors }: Props): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <p className="vault-section-help">{t('vault.visualPromptHint')}</p>
      <RichTextArea
        labelKey="vault.fields.visualPrompt"
        fieldPath="appearance.visualReference.prompt"
        value={value}
        fieldErrors={fieldErrors}
        onChange={onChange}
        rows={8}
      />
    </>
  );
}
