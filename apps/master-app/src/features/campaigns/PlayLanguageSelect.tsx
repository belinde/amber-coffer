import { PLAY_LANGUAGES, type PlayLanguage } from '@amber/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Field } from '../../components/ui/Field.js';

type Props = {
  id: string;
  value: PlayLanguage;
  onChange: (value: PlayLanguage) => void;
  disabled?: boolean;
};

export function PlayLanguageSelect({ id, value, onChange, disabled = false }: Props): ReactElement {
  const { t } = useTranslation();

  return (
    <div className="play-language-select">
      <Field label={t('campaign.playLanguage')} htmlFor={id}>
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value as PlayLanguage)}
        >
          {PLAY_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {t(`campaign.playLanguageOptions.${lang}`)}
            </option>
          ))}
        </select>
      </Field>
      <p className="vault-section-help">{t('campaign.playLanguageHint')}</p>
    </div>
  );
}
