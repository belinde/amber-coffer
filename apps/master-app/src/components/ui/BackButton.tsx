import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { ActionIcons } from './icons.js';

const BACK_ICON_SIZE = 14;

type Props = {
  onClick: () => void;
};

export function BackButton({ onClick }: Props): ReactElement {
  const { t } = useTranslation();
  const Icon = ActionIcons.back;

  return (
    <button type="button" className="btn btn-back" onClick={onClick}>
      <Icon size={BACK_ICON_SIZE} weight="regular" aria-hidden />
      <span className="btn-label">{t('vault.back')}</span>
    </button>
  );
}
