import { BackButton as UiBackButton } from '@amber/ui';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  onClick: () => void;
};

export function BackButton({ onClick }: Props): ReactElement {
  const { t } = useTranslation();
  return <UiBackButton label={t('vault.back')} onClick={onClick} />;
}
