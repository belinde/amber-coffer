import { InfoBanner as UiInfoBanner } from '@amber/ui';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  onDismiss: () => void;
  children: ReactNode;
  labelledBy?: string | undefined;
};

export function InfoBanner({ onDismiss, children, labelledBy }: Props): ReactElement {
  const { t } = useTranslation();
  return (
    <UiInfoBanner
      onDismiss={onDismiss}
      labelledBy={labelledBy}
      dismissAriaLabel={t('common.dismiss')}
    >
      {children}
    </UiInfoBanner>
  );
}
